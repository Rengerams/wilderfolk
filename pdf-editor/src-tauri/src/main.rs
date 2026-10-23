// Keeps the packaged Windows build from opening an extra console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pdf_studio_lib::run();
}
