use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: &'static str,
    pub label: &'static str,
    pub lab: &'static str,
    pub origin: &'static str,
    pub hf_repo: &'static str,
    pub hf_file: &'static str,
    pub size_bytes: u64,
    pub context_tokens: u32,
    pub chat_template: ChatTemplate,
    pub description: &'static str,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ChatTemplate {
    Gemma,
    Qwen,
    Llama,
    Phi,
    ChatGlm,
}

pub const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "gemma-4-e2b",
        label: "Gemma 4 E2B",
        lab: "Google",
        origin: "US",
        hf_repo: "unsloth/gemma-4-E2B-it-GGUF",
        hf_file: "gemma-4-E2B-it-Q4_K_M.gguf",
        size_bytes: 1_500_000_000,
        context_tokens: 256_000,
        chat_template: ChatTemplate::Gemma,
        description: "Best ultra-light; 140 languages; on-device tuned.",
    },
    CatalogEntry {
        id: "qwen-3.5-2b",
        label: "Qwen 3.5 2B",
        lab: "Alibaba",
        origin: "CN",
        hf_repo: "unsloth/Qwen3.5-2B-GGUF",
        hf_file: "Qwen3.5-2B-Q4_K_M.gguf",
        size_bytes: 1_300_000_000,
        context_tokens: 262_144,
        chat_template: ChatTemplate::Qwen,
        description: "Chinese ultra-light; Apache 2.0.",
    },
    CatalogEntry {
        id: "gemma-4-e4b",
        label: "Gemma 4 E4B",
        lab: "Google",
        origin: "US",
        hf_repo: "unsloth/gemma-4-E4B-it-GGUF",
        hf_file: "gemma-4-E4B-it-Q4_K_M.gguf",
        size_bytes: 2_500_000_000,
        context_tokens: 256_000,
        chat_template: ChatTemplate::Gemma,
        description: "Balanced default; 140 languages; strong multilingual.",
    },
    CatalogEntry {
        id: "phi-4-mini",
        label: "Phi-4-mini 3.8B",
        lab: "Microsoft",
        origin: "US",
        hf_repo: "unsloth/Phi-4-mini-instruct-GGUF",
        hf_file: "Phi-4-mini-instruct-Q4_K_M.gguf",
        size_bytes: 2_500_000_000,
        context_tokens: 128_000,
        chat_template: ChatTemplate::Phi,
        description: "Top small-model reasoning (83.7% ARC-C).",
    },
    CatalogEntry {
        id: "qwen-3.5-4b",
        label: "Qwen 3.5 4B",
        lab: "Alibaba",
        origin: "CN",
        hf_repo: "unsloth/Qwen3.5-4B-GGUF",
        hf_file: "Qwen3.5-4B-Q4_K_M.gguf",
        size_bytes: 2_500_000_000,
        context_tokens: 262_144,
        chat_template: ChatTemplate::Qwen,
        description: "Chinese balanced; strong CJK.",
    },
    CatalogEntry {
        id: "llama-3.3-8b",
        label: "Llama 3.3 8B",
        lab: "Meta",
        origin: "US",
        hf_repo: "unsloth/Llama-3.3-8B-Instruct-GGUF",
        hf_file: "Llama-3.3-8B-Instruct-Q4_K_M.gguf",
        size_bytes: 5_000_000_000,
        context_tokens: 128_000,
        chat_template: ChatTemplate::Llama,
        description: "Safe community-default generalist.",
    },
    CatalogEntry {
        id: "glm-4-9b",
        label: "GLM-4 9B",
        lab: "Zhipu",
        origin: "CN",
        hf_repo: "zai-org/GLM-4-9B-0414-GGUF",
        hf_file: "GLM-4-9B-0414-Q4_K_M.gguf",
        size_bytes: 5_000_000_000,
        context_tokens: 128_000,
        chat_template: ChatTemplate::ChatGlm,
        description: "Strong Chinese + English; MGSM leader.",
    },
    CatalogEntry {
        id: "qwen-3.5-9b",
        label: "Qwen 3.5 9B",
        lab: "Alibaba",
        origin: "CN",
        hf_repo: "unsloth/Qwen3.5-9B-GGUF",
        hf_file: "Qwen3.5-9B-Q4_K_M.gguf",
        size_bytes: 5_000_000_000,
        context_tokens: 262_144,
        chat_template: ChatTemplate::Qwen,
        description: "Best under-10B reasoner; long-form pick (262K context).",
    },
];

pub fn find(id: &str) -> Option<&'static CatalogEntry> {
    CATALOG.iter().find(|e| e.id == id)
}
