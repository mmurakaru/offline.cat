use std::path::PathBuf;
use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;

use crate::catalog::{self, CatalogEntry};
use crate::downloader::{sink_from_channel, DownloadEvent, Downloader};
use crate::engine::{self, ActiveModel, TranslateRequest};
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntryWithStatus {
    #[serde(flatten)]
    entry: CatalogEntry,
    installed: bool,
}

#[tauri::command]
pub fn list_catalog(state: State<'_, AppState>) -> Vec<CatalogEntryWithStatus> {
    catalog::CATALOG
        .iter()
        .map(|entry| {
            let installed = model_path(&state.models_dir, entry.id).exists();
            CatalogEntryWithStatus {
                entry: entry.clone(),
                installed,
            }
        })
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadArgs {
    pub id: String,
    #[serde(default)]
    pub expected_sha256: Option<String>,
}

#[tauri::command]
pub async fn download_model(
    args: DownloadArgs,
    on_event: Channel<DownloadEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let entry = catalog::find(&args.id).ok_or_else(|| format!("unknown model id: {}", args.id))?;
    let target = model_path(&state.models_dir, entry.id);

    state.cancel_download.store(false, Ordering::Relaxed);
    let cancel = state.cancel_download.clone();

    let sink = sink_from_channel(on_event);
    let downloader = Downloader::new();
    let result = downloader
        .download(
            entry.hf_repo,
            entry.hf_file,
            args.expected_sha256.as_deref(),
            &target,
            cancel,
            &sink,
        )
        .await;

    match result {
        Ok(()) => Ok(()),
        Err(err) => {
            let msg = format!("{err:#}");
            sink(DownloadEvent::Failed {
                message: msg.clone(),
            });
            Err(msg)
        }
    }
}

#[tauri::command]
pub fn cancel_download(state: State<'_, AppState>) {
    state.cancel_download.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn delete_model(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = model_path(&state.models_dir, &id);

    let mut guard = state.active_model.lock().await;
    if let Some(active) = guard.as_ref() {
        if active.id == id {
            *guard = None;
        }
    }
    drop(guard);

    if path.exists() {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("failed to remove model file: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_model(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let entry = catalog::find(&id).ok_or_else(|| format!("unknown model id: {id}"))?;
    let path = model_path(&state.models_dir, entry.id);

    if !path.exists() {
        return Err(format!("model file not found: {}", path.display()));
    }

    let path_owned = path.clone();
    let id_owned = entry.id.to_string();
    let template = entry.chat_template;

    let active =
        tokio::task::spawn_blocking(move || ActiveModel::load(id_owned, &path_owned, template))
            .await
            .map_err(|e| format!("load task panicked: {e}"))?
            .map_err(|e| format!("failed to load model: {e:#}"))?;

    let mut guard = state.active_model.lock().await;
    *guard = Some(active);
    Ok(())
}

#[tauri::command]
pub async fn unload_model(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.active_model.lock().await;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn active_model(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let guard = state.active_model.lock().await;
    Ok(guard.as_ref().map(|m| m.id.clone()))
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub source: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranslateProgress {
    pub id: String,
    pub translation: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateArgs {
    pub segments: Vec<Segment>,
    pub source_lang: String,
    pub target_lang: String,
}

#[tauri::command]
pub async fn translate(
    args: TranslateArgs,
    on_progress: Channel<TranslateProgress>,
    state: State<'_, AppState>,
) -> Result<Vec<TranslateProgress>, String> {
    state.cancel_translate.store(false, Ordering::Relaxed);

    let guard = state.active_model.lock().await;
    let active = guard
        .as_ref()
        .ok_or_else(|| "no model loaded".to_string())?;

    let mut results = Vec::with_capacity(args.segments.len());

    for segment in &args.segments {
        if state.cancel_translate.load(Ordering::Relaxed) {
            break;
        }

        let req = TranslateRequest {
            source_text: &segment.source,
            source_lang: &args.source_lang,
            target_lang: &args.target_lang,
            cancel: state.cancel_translate.clone(),
        };

        let translation =
            engine::translate(active, req).map_err(|e| format!("translation failed: {e:#}"))?;

        let result = TranslateProgress {
            id: segment.id.clone(),
            translation,
        };
        on_progress.send(result.clone()).ok();
        results.push(result);
    }

    Ok(results)
}

#[tauri::command]
pub fn cancel_translate(state: State<'_, AppState>) {
    state.cancel_translate.store(true, Ordering::Relaxed);
}

fn model_path(models_dir: &std::path::Path, id: &str) -> PathBuf {
    models_dir.join(format!("{id}.gguf"))
}
