use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::engine::ActiveModel;

pub struct AppState {
    pub models_dir: PathBuf,
    pub active_model: Mutex<Option<ActiveModel>>,
    pub cancel_translate: Arc<AtomicBool>,
    pub cancel_download: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            models_dir,
            active_model: Mutex::new(None),
            cancel_translate: Arc::new(AtomicBool::new(false)),
            cancel_download: Arc::new(AtomicBool::new(false)),
        }
    }
}
