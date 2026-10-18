use std::{env, path::PathBuf, process::Command};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && env::var_os("CARGO_FEATURE_METAL").is_some()
    {
        link_clang_runtime();
    }
    tauri_build::build();
}

fn link_clang_runtime() {
    let output = Command::new("clang")
        .arg("-print-resource-dir")
        .output()
        .expect("clang must be on PATH to build the metal feature");
    let resource_dir = String::from_utf8(output.stdout).expect("clang printed a non-UTF-8 path");
    let runtime_dir = PathBuf::from(resource_dir.trim()).join("lib/darwin");
    println!("cargo:rustc-link-search=native={}", runtime_dir.display());
    println!("cargo:rustc-link-lib=static=clang_rt.osx");
}
