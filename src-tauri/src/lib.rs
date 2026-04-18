mod catalog;
mod commands;
mod downloader;
mod engine;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "offline_cat_lib=info,warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let models_dir = app
                .path()
                .app_data_dir()
                .map(|d| d.join("models"))
                .expect("failed to resolve app data directory");
            std::fs::create_dir_all(&models_dir).ok();
            app.manage(AppState::new(models_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_catalog,
            commands::download_model,
            commands::cancel_download,
            commands::delete_model,
            commands::load_model,
            commands::unload_model,
            commands::translate,
            commands::cancel_translate,
            commands::active_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running offline.cat");
}
