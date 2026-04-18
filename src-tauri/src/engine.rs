use std::num::NonZeroU32;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use anyhow::{Context, Result};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{AddBos, LlamaModel};
use llama_cpp_2::sampling::LlamaSampler;

use crate::catalog::ChatTemplate;

static BACKEND: OnceLock<LlamaBackend> = OnceLock::new();

fn backend() -> Result<&'static LlamaBackend> {
    if let Some(b) = BACKEND.get() {
        return Ok(b);
    }
    let b = LlamaBackend::init().context("failed to initialize llama backend")?;
    Ok(BACKEND.get_or_init(|| b))
}

pub struct ActiveModel {
    pub id: String,
    pub model: LlamaModel,
    pub chat_template: ChatTemplate,
}

impl ActiveModel {
    pub fn load(id: String, path: &Path, chat_template: ChatTemplate) -> Result<Self> {
        let backend = backend()?;
        let params = LlamaModelParams::default();
        let params = if cfg!(any(feature = "metal", feature = "cuda", feature = "vulkan")) {
            params.with_n_gpu_layers(1000)
        } else {
            params
        };
        let model = LlamaModel::load_from_file(backend, path, &params)
            .with_context(|| format!("failed to load model from {}", path.display()))?;
        Ok(Self {
            id,
            model,
            chat_template,
        })
    }
}

pub struct TranslateRequest<'a> {
    pub source_text: &'a str,
    pub source_lang: &'a str,
    pub target_lang: &'a str,
    pub cancel: Arc<AtomicBool>,
}

pub fn translate(active: &ActiveModel, req: TranslateRequest<'_>) -> Result<String> {
    let backend = backend()?;

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(NonZeroU32::new(4096).unwrap()))
        .with_n_batch(512);

    let mut ctx = active
        .model
        .new_context(backend, ctx_params)
        .context("failed to create llama context")?;

    let prompt = format_prompt(
        active.chat_template,
        req.source_lang,
        req.target_lang,
        req.source_text,
    );

    let tokens = active
        .model
        .str_to_token(&prompt, AddBos::Always)
        .context("failed to tokenize prompt")?;

    let n_prompt = tokens.len() as i32;
    let n_ctx = ctx.n_ctx() as i32;
    let max_new = (n_ctx - n_prompt - 4).clamp(64, 2048);

    let mut batch = LlamaBatch::new(512, 1);
    for (pos, token) in tokens.iter().enumerate() {
        let is_last = pos == tokens.len() - 1;
        batch
            .add(*token, pos as i32, &[0], is_last)
            .context("failed to add prompt token to batch")?;
    }
    ctx.decode(&mut batch).context("failed to decode prompt")?;

    let mut sampler = LlamaSampler::chain_simple([LlamaSampler::temp(0.0), LlamaSampler::greedy()]);

    let mut output = String::new();
    let eos = active.model.token_eos();
    let mut decoder = encoding_rs::UTF_8.new_decoder();

    for cur_pos in n_prompt..(n_prompt + max_new) {
        if req.cancel.load(Ordering::Relaxed) {
            break;
        }

        let token = sampler.sample(&ctx, -1);
        sampler.accept(token);

        if token == eos {
            break;
        }

        if let Ok(piece) = active
            .model
            .token_to_piece(token, &mut decoder, false, None)
        {
            output.push_str(&piece);
        }

        if has_stop_marker(&output) {
            break;
        }

        batch.clear();
        batch
            .add(token, cur_pos, &[0], true)
            .context("failed to add sampled token to batch")?;
        ctx.decode(&mut batch).context("failed to decode step")?;
    }

    Ok(clean_output(&output))
}

fn has_stop_marker(s: &str) -> bool {
    s.contains("<|end|>")
        || s.contains("<|eot_id|>")
        || s.contains("<|im_end|>")
        || s.contains("<end_of_turn>")
        || s.ends_with("\n\n\n")
}

fn clean_output(s: &str) -> String {
    let trimmed = s
        .split("<|end|>")
        .next()
        .unwrap_or(s)
        .split("<|eot_id|>")
        .next()
        .unwrap_or(s)
        .split("<|im_end|>")
        .next()
        .unwrap_or(s)
        .split("<end_of_turn>")
        .next()
        .unwrap_or(s);

    let mut out = trimmed.trim().to_string();

    if let Some(idx) = out.find("```") {
        if let Some(end) = out[idx + 3..].find("```") {
            let inner = &out[idx + 3..idx + 3 + end];
            let inner = inner.trim_start_matches(|c: char| c.is_alphanumeric() || c == '-');
            out = inner.trim().to_string();
        }
    }

    out.trim_matches('"').to_string()
}

fn format_prompt(template: ChatTemplate, src: &str, tgt: &str, text: &str) -> String {
    let system = format!(
        "You are a professional translator. Translate the user's text from {src} to {tgt}. \
         Output only the translation, with no explanations, no code fences, no quotation marks, \
         and no commentary. Preserve punctuation, formatting, and inline tags exactly."
    );
    let user = format!("Text:\n{text}\n\nTranslation:");

    match template {
        ChatTemplate::Gemma => {
            format!("<start_of_turn>user\n{system}\n\n{user}<end_of_turn>\n<start_of_turn>model\n")
        }
        ChatTemplate::Qwen => format!(
            "<|im_start|>system\n{system}<|im_end|>\n\
             <|im_start|>user\n{user}<|im_end|>\n\
             <|im_start|>assistant\n"
        ),
        ChatTemplate::Llama => format!(
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|>\
             <|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|>\
             <|start_header_id|>assistant<|end_header_id|>\n\n"
        ),
        ChatTemplate::Phi => {
            format!("<|system|>\n{system}<|end|>\n<|user|>\n{user}<|end|>\n<|assistant|>\n")
        }
        ChatTemplate::ChatGlm => {
            format!("[gMASK]<sop><|system|>\n{system}<|user|>\n{user}<|assistant|>\n")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_stop_marker_detects_phi_end() {
        assert!(has_stop_marker("translation here<|end|>"));
    }

    #[test]
    fn has_stop_marker_detects_llama_eot() {
        assert!(has_stop_marker("translation here<|eot_id|>"));
    }

    #[test]
    fn has_stop_marker_detects_qwen_im_end() {
        assert!(has_stop_marker("translation<|im_end|>"));
    }

    #[test]
    fn has_stop_marker_detects_gemma_end_of_turn() {
        assert!(has_stop_marker("translation<end_of_turn>"));
    }

    #[test]
    fn has_stop_marker_detects_triple_newline() {
        assert!(has_stop_marker("translation\n\n\n"));
    }

    #[test]
    fn has_stop_marker_returns_false_for_plain_text() {
        assert!(!has_stop_marker("just a normal translation"));
    }

    #[test]
    fn clean_output_strips_phi_end_marker_and_trims() {
        assert_eq!(clean_output("  Hola mundo<|end|>extra  "), "Hola mundo");
    }

    #[test]
    fn clean_output_strips_llama_eot_marker() {
        assert_eq!(clean_output("Hola mundo<|eot_id|>"), "Hola mundo");
    }

    #[test]
    fn clean_output_strips_qwen_im_end() {
        assert_eq!(clean_output("Hola mundo<|im_end|>"), "Hola mundo");
    }

    #[test]
    fn clean_output_strips_gemma_end_of_turn() {
        assert_eq!(clean_output("Hola mundo<end_of_turn>"), "Hola mundo");
    }

    #[test]
    fn clean_output_removes_surrounding_quotes() {
        assert_eq!(clean_output("\"Hola mundo\""), "Hola mundo");
    }

    #[test]
    fn clean_output_extracts_from_plain_code_fence() {
        assert_eq!(clean_output("```\nHola mundo\n```"), "Hola mundo");
    }

    #[test]
    fn clean_output_extracts_from_language_tagged_code_fence() {
        assert_eq!(clean_output("```es\nHola mundo\n```"), "Hola mundo");
    }

    #[test]
    fn clean_output_passes_through_plain_translation() {
        assert_eq!(clean_output("Hola mundo"), "Hola mundo");
    }

    #[test]
    fn format_prompt_gemma_wraps_in_start_of_turn_tags() {
        let prompt = format_prompt(ChatTemplate::Gemma, "en", "es", "Hello");
        assert!(prompt.starts_with("<start_of_turn>user\n"));
        assert!(prompt.ends_with("<start_of_turn>model\n"));
        assert!(prompt.contains("from en to es"));
        assert!(prompt.contains("Hello"));
    }

    #[test]
    fn format_prompt_qwen_uses_im_start_blocks() {
        let prompt = format_prompt(ChatTemplate::Qwen, "en", "ja", "Hello");
        assert!(prompt.contains("<|im_start|>system\n"));
        assert!(prompt.contains("<|im_start|>user\n"));
        assert!(prompt.ends_with("<|im_start|>assistant\n"));
        assert!(prompt.contains("from en to ja"));
    }

    #[test]
    fn format_prompt_llama_uses_header_ids_and_begin_of_text() {
        let prompt = format_prompt(ChatTemplate::Llama, "de", "en", "Hallo");
        assert!(prompt.starts_with("<|begin_of_text|>"));
        assert!(prompt.contains("<|start_header_id|>system<|end_header_id|>"));
        assert!(prompt.ends_with("<|start_header_id|>assistant<|end_header_id|>\n\n"));
        assert!(prompt.contains("Hallo"));
    }

    #[test]
    fn format_prompt_phi_uses_system_user_assistant_tags() {
        let prompt = format_prompt(ChatTemplate::Phi, "en", "fr", "Hi");
        assert!(prompt.starts_with("<|system|>\n"));
        assert!(prompt.contains("<|user|>\nText:\nHi"));
        assert!(prompt.ends_with("<|assistant|>\n"));
    }

    #[test]
    fn format_prompt_chatglm_uses_gmask_prefix() {
        let prompt = format_prompt(ChatTemplate::ChatGlm, "en", "zh", "Hello");
        assert!(prompt.starts_with("[gMASK]<sop>"));
        assert!(prompt.contains("<|user|>\nText:\nHello"));
        assert!(prompt.ends_with("<|assistant|>\n"));
    }

    #[test]
    fn format_prompt_includes_source_and_target_language_codes() {
        for template in [
            ChatTemplate::Gemma,
            ChatTemplate::Qwen,
            ChatTemplate::Llama,
            ChatTemplate::Phi,
            ChatTemplate::ChatGlm,
        ] {
            let prompt = format_prompt(template, "pt", "ca", "texto");
            assert!(
                prompt.contains("from pt to ca"),
                "template {template:?} did not embed language pair"
            );
            assert!(
                prompt.contains("texto"),
                "template {template:?} did not embed source text"
            );
        }
    }
}
