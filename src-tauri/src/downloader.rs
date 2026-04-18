use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DownloadEvent {
    Started {
        total_bytes: u64,
    },
    Progress {
        bytes_downloaded: u64,
        total_bytes: u64,
    },
    Verifying,
    Finished,
    Cancelled,
    Failed {
        message: String,
    },
}

pub type EventSink = Arc<dyn Fn(DownloadEvent) + Send + Sync>;

pub fn sink_from_channel(channel: Channel<DownloadEvent>) -> EventSink {
    Arc::new(move |event| {
        let _ = channel.send(event);
    })
}

pub struct Downloader {
    client: reqwest::Client,
}

impl Downloader {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("offline.cat/0.1")
            .connect_timeout(std::time::Duration::from_secs(30))
            .read_timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("reqwest client should build");
        Self { client }
    }

    pub async fn download(
        &self,
        hf_repo: &str,
        hf_file: &str,
        expected_sha256: Option<&str>,
        target_path: &Path,
        cancel: Arc<AtomicBool>,
        on_event: &EventSink,
    ) -> Result<()> {
        let url = format!("https://huggingface.co/{hf_repo}/resolve/main/{hf_file}");
        self.download_from_url(&url, expected_sha256, target_path, cancel, on_event)
            .await
    }

    pub async fn download_from_url(
        &self,
        url: &str,
        expected_sha256: Option<&str>,
        target_path: &Path,
        cancel: Arc<AtomicBool>,
        on_event: &EventSink,
    ) -> Result<()> {
        let parent = target_path
            .parent()
            .context("target path has no parent")?;
        fs::create_dir_all(parent)
            .await
            .context("failed to create models directory")?;

        let partial_path: PathBuf = target_path.with_extension("gguf.partial");
        let resume_from = match fs::metadata(&partial_path).await {
            Ok(meta) => meta.len(),
            Err(_) => 0,
        };

        let mut request = self.client.get(url);
        if resume_from > 0 {
            request = request.header("Range", format!("bytes={resume_from}-"));
        }

        let response = request.send().await.context("request to HuggingFace failed")?;

        if !response.status().is_success() && response.status().as_u16() != 206 {
            bail!("HuggingFace returned status {}", response.status());
        }

        let total_bytes = response
            .content_length()
            .map(|n| n + resume_from)
            .unwrap_or(resume_from);

        on_event(DownloadEvent::Started { total_bytes });

        let mut file = OpenOptions::new()
            .create(true)
            .append(resume_from > 0)
            .write(true)
            .open(&partial_path)
            .await
            .context("failed to open partial file")?;

        let mut downloaded = resume_from;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                file.flush().await.ok();
                drop(file);
                on_event(DownloadEvent::Cancelled);
                return Ok(());
            }
            let chunk = chunk.context("network error while downloading")?;
            file.write_all(&chunk)
                .await
                .context("failed to write chunk")?;
            downloaded += chunk.len() as u64;
            on_event(DownloadEvent::Progress {
                bytes_downloaded: downloaded,
                total_bytes,
            });
        }

        file.flush().await.context("failed to flush partial file")?;
        drop(file);

        if let Some(expected) = expected_sha256 {
            on_event(DownloadEvent::Verifying);
            let actual = sha256_of(&partial_path).await?;
            if !actual.eq_ignore_ascii_case(expected) {
                fs::remove_file(&partial_path).await.ok();
                bail!(
                    "SHA256 mismatch: expected {expected}, got {actual}. Partial file removed."
                );
            }
        }

        fs::rename(&partial_path, target_path)
            .await
            .context("failed to rename partial file to final path")?;

        on_event(DownloadEvent::Finished);
        Ok(())
    }
}

async fn sha256_of(path: &Path) -> Result<String> {
    let bytes = fs::read(path).await.context("failed to read file for hash")?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Mutex;
    use std::time::Duration;

    use serde_json::json;
    use sha2::{Digest, Sha256};
    use tempfile::TempDir;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn download_event_serializes_field_names_as_camel_case() {
        let started = DownloadEvent::Started {
            total_bytes: 1234,
        };
        assert_eq!(
            serde_json::to_value(&started).unwrap(),
            json!({ "kind": "started", "totalBytes": 1234 }),
            "Started must serialize as camelCase for the TS side to read it"
        );

        let progress = DownloadEvent::Progress {
            bytes_downloaded: 42,
            total_bytes: 100,
        };
        assert_eq!(
            serde_json::to_value(&progress).unwrap(),
            json!({
                "kind": "progress",
                "bytesDownloaded": 42,
                "totalBytes": 100,
            }),
            "Progress must serialize as camelCase"
        );

        let failed = DownloadEvent::Failed {
            message: "boom".into(),
        };
        assert_eq!(
            serde_json::to_value(&failed).unwrap(),
            json!({ "kind": "failed", "message": "boom" }),
        );
    }

    fn capturing_sink() -> (EventSink, Arc<Mutex<Vec<DownloadEvent>>>) {
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let sink: EventSink = Arc::new(move |event| {
            events_clone.lock().unwrap().push(event);
        });
        (sink, events)
    }

    fn sha256_hex(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hex::encode(hasher.finalize())
    }

    #[tokio::test]
    async fn download_writes_file_and_emits_started_progress_finished() {
        let server = MockServer::start().await;
        let body = b"hello world".repeat(1024);
        let expected_hash = sha256_hex(&body);

        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body.clone()))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("models").join("test.gguf");
        let cancel = Arc::new(AtomicBool::new(false));
        let (sink, events) = capturing_sink();

        let downloader = Downloader::new();
        downloader
            .download_from_url(
                &format!("{}/model.gguf", server.uri()),
                Some(&expected_hash),
                &target,
                cancel,
                &sink,
            )
            .await
            .unwrap();

        assert!(target.exists(), "target file should exist after success");
        assert_eq!(tokio::fs::read(&target).await.unwrap(), body);

        let events = events.lock().unwrap();
        assert!(matches!(events.first(), Some(DownloadEvent::Started { .. })));
        assert!(events.iter().any(|e| matches!(e, DownloadEvent::Progress { .. })));
        assert!(events.iter().any(|e| matches!(e, DownloadEvent::Verifying)));
        assert!(matches!(events.last(), Some(DownloadEvent::Finished)));
    }

    #[tokio::test]
    async fn download_fails_with_sha256_mismatch_and_removes_partial() {
        let server = MockServer::start().await;
        let body = b"actual body content".to_vec();
        let wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000";

        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body.clone()))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("test.gguf");
        let cancel = Arc::new(AtomicBool::new(false));
        let (sink, _events) = capturing_sink();

        let err = Downloader::new()
            .download_from_url(
                &format!("{}/model.gguf", server.uri()),
                Some(wrong_hash),
                &target,
                cancel,
                &sink,
            )
            .await
            .unwrap_err();

        assert!(format!("{err:#}").contains("SHA256 mismatch"));
        assert!(!target.exists(), "target file must not exist on hash failure");
        assert!(
            !target.with_extension("gguf.partial").exists(),
            "partial file should be cleaned up on hash failure",
        );
    }

    #[tokio::test]
    async fn download_fails_on_server_error_status() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("test.gguf");
        let cancel = Arc::new(AtomicBool::new(false));
        let (sink, events) = capturing_sink();

        let err = Downloader::new()
            .download_from_url(
                &format!("{}/model.gguf", server.uri()),
                None,
                &target,
                cancel,
                &sink,
            )
            .await
            .unwrap_err();

        assert!(format!("{err:#}").contains("500"));
        assert!(!target.exists());
        assert!(
            !events.lock().unwrap().iter().any(|e| matches!(e, DownloadEvent::Started { .. })),
            "Started event should not fire when server returns error",
        );
    }

    #[tokio::test]
    async fn download_resumes_from_existing_partial_with_range_header() {
        let server = MockServer::start().await;
        let full_body = b"0123456789ABCDEFGHIJ".to_vec();
        let already_have: Vec<u8> = full_body[..10].to_vec();
        let remaining: Vec<u8> = full_body[10..].to_vec();

        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .and(header("Range", "bytes=10-"))
            .respond_with(ResponseTemplate::new(206).set_body_bytes(remaining.clone()))
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("test.gguf");
        let partial = target.with_extension("gguf.partial");
        tokio::fs::write(&partial, &already_have).await.unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let (sink, _events) = capturing_sink();

        Downloader::new()
            .download_from_url(
                &format!("{}/model.gguf", server.uri()),
                Some(&sha256_hex(&full_body)),
                &target,
                cancel,
                &sink,
            )
            .await
            .unwrap();

        let final_bytes = tokio::fs::read(&target).await.unwrap();
        assert_eq!(final_bytes, full_body, "resumed download must match full file");
    }

    #[tokio::test]
    async fn download_aborts_gracefully_when_cancel_flag_is_set() {
        let server = MockServer::start().await;

        Mock::given(method("GET"))
            .and(path("/model.gguf"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_delay(Duration::from_millis(500))
                    .set_body_bytes(vec![0u8; 1024 * 1024]),
            )
            .mount(&server)
            .await;

        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("test.gguf");
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_clone = cancel.clone();
        let (sink, events) = capturing_sink();

        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            cancel_clone.store(true, Ordering::Relaxed);
        });

        Downloader::new()
            .download_from_url(
                &format!("{}/model.gguf", server.uri()),
                None,
                &target,
                cancel,
                &sink,
            )
            .await
            .expect("cancelled download should return Ok, not Err");

        assert!(!target.exists(), "cancelled download must not produce final file");
        assert!(
            events.lock().unwrap().iter().any(|e| matches!(e, DownloadEvent::Cancelled)),
            "Cancelled event must be emitted",
        );
        assert!(
            !events.lock().unwrap().iter().any(|e| matches!(e, DownloadEvent::Finished)),
            "Finished must not be emitted on cancel",
        );
    }
}
