use image::{imageops::FilterType, ImageReader};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

static VALID_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

#[derive(Debug, serde::Serialize, Clone)]
struct FolderContents {
    folders: Vec<FolderInfo>,
    images: Vec<ImageInfo>,
    path: String,
}

#[derive(Debug, serde::Serialize, Clone)]
struct ImageInfo {
    path: String,
    filename: String,
}

#[derive(Debug, serde::Serialize, Clone)]
struct QuickScanResult {
    total: usize,
    folders: Vec<FolderInfo>,
}

#[derive(Debug, serde::Serialize, Clone)]
struct FolderInfo {
    path: String,
    name: String,
    image_count: usize,
}

#[derive(Debug, serde::Serialize, Clone)]
struct ThumbnailInfo {
    id: String,
    original_path: String,
    thumbnail_path: String,
    filename: String,
    relative_path: String,
}

#[derive(Debug, serde::Serialize, Clone)]
struct BatchProgress {
    batch: usize,
    total_batches: usize,
    thumbnails: Vec<ThumbnailInfo>,
    progress: f32,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn scan_for_images(folder_path: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut images = Vec::new();

    fn scan_recursive(path: &Path, images: &mut Vec<std::path::PathBuf>) -> Result<(), String> {
        if !path.exists() {
            return Err(format!("Path does not exist: {}", path.display()));
        }

        let entries = fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;

        for entry in entries.flatten() {
            let entry_path = entry.path();

            if entry_path.is_dir() {
                // Recursively scan subdirectories
                scan_recursive(&entry_path, images)?;
            } else if entry_path.is_file() {
                // Fast extension check
                if let Some(ext) = entry_path.extension() {
                    if let Some(ext_str) = ext.to_str() {
                        let ext_lower = ext_str.to_lowercase();
                        if VALID_EXTENSIONS.contains(&ext_lower.as_str()) {
                            images.push(entry_path);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    scan_recursive(folder_path, &mut images)?;
    Ok(images)
}

#[tauri::command]
async fn quick_scan(folder_path: String) -> Result<QuickScanResult, String> {
    println!("Quick scanning folder: {}", folder_path);

    let source_path = Path::new(&folder_path);
    let images = scan_for_images(source_path)?;

    println!("Found {} images", images.len());

    // Build folder structure
    let mut folder_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for img_path in &images {
        if let Some(parent) = img_path.parent() {
            let parent_str = parent.to_string_lossy().to_string();
            *folder_map.entry(parent_str).or_insert(0) += 1;
        }
    }

    let folders: Vec<FolderInfo> = folder_map
        .into_iter()
        .map(|(path, count)| {
            let name = Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            FolderInfo {
                path: path.clone(),
                name,
                image_count: count,
            }
        })
        .collect();

    Ok(QuickScanResult {
        total: images.len(),
        folders,
    })
}

fn generate_fast_thumbnail(
    source_path: &Path,
    app_handle: &AppHandle,
    image_id: &str,
) -> Result<String, String> {
    let app_data = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let thumbnails_dir = app_data.join("thumbnails");
    fs::create_dir_all(&thumbnails_dir)
        .map_err(|e| format!("Failed to create thumbnails dir: {}", e))?;

    // Open image
    let img = ImageReader::open(source_path)
        .map_err(|_| "Skip".to_string())?
        .decode()
        .map_err(|_| "Skip".to_string())?;

    // Use Nearest for MAXIMUM speed - 100x100 tiny thumbnails
    let thumbnail = img.resize(100, 100, FilterType::Nearest);

    // Save as JPEG quality 75 (fast)
    let thumb_path = thumbnails_dir.join(format!("{}.jpg", image_id));
    thumbnail
        .save_with_format(&thumb_path, image::ImageFormat::Jpeg)
        .map_err(|_| "Skip".to_string())?;

    Ok(thumb_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn browse_folder(folder_path: String) -> Result<FolderContents, String> {
    let path = Path::new(&folder_path);

    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut folders = Vec::new();
    let mut images = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();

        if entry_path.is_dir() {
            let name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            folders.push(FolderInfo {
                path: entry_path.to_string_lossy().to_string(),
                name,
                image_count: 0,
            });
        } else if entry_path.is_file() {
            // Fast extension check with static array
            if let Some(ext) = entry_path.extension() {
                if let Some(ext_str) = ext.to_str() {
                    let ext_lower = ext_str.to_lowercase();
                    if VALID_EXTENSIONS.contains(&ext_lower.as_str()) {
                        let filename = entry_path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        images.push(ImageInfo {
                            path: entry_path.to_string_lossy().to_string(),
                            filename,
                        });
                    }
                }
            }
        }
    }

    // Natural sort (case-insensitive)
    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    images.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));

    Ok(FolderContents {
        folders,
        images,
        path: folder_path,
    })
}

#[tauri::command]
async fn count_folder_images(folder_path: String) -> Result<usize, String> {
    let path = Path::new(&folder_path);
    let count = scan_for_images(path).unwrap_or_default().len();
    Ok(count)
}

#[tauri::command]
async fn import_pack_progressive(
    app: AppHandle,
    folder_path: String,
    _pack_id: String,
) -> Result<(), String> {
    println!("Starting progressive import from: {}", folder_path);

    let source_path = Path::new(&folder_path);
    let images = scan_for_images(source_path)?;

    let total = images.len();
    println!("Processing {} images", total);

    let start_time = std::time::Instant::now();

    // Smaller batches with thumbnail generation
    let batch_size = 100;
    let total_batches = (total + batch_size - 1) / batch_size;

    for (batch_num, chunk) in images.chunks(batch_size).enumerate() {
        let batch_start = std::time::Instant::now();
        println!("Processing batch {} of {}", batch_num + 1, total_batches);

        // Generate thumbnails - skip failures
        let thumbnails: Vec<ThumbnailInfo> = chunk
            .iter()
            .filter_map(|img_path| {
                let image_id = Uuid::new_v4().to_string();

                let filename = img_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                let relative_path = img_path
                    .strip_prefix(source_path)
                    .ok()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.to_str())
                    .unwrap_or("")
                    .to_string();

                let original_path_str = img_path.to_string_lossy().to_string();

                // Try to generate thumbnail, use original if it fails
                let thumbnail_path = generate_fast_thumbnail(img_path, &app, &image_id)
                    .unwrap_or_else(|_| original_path_str.clone());

                Some(ThumbnailInfo {
                    id: image_id,
                    original_path: original_path_str,
                    thumbnail_path,
                    filename,
                    relative_path,
                })
            })
            .collect();

        let progress = ((batch_num + 1) as f32 / total_batches as f32) * 100.0;

        let batch_count = thumbnails.len();

        // Emit batch to frontend
        let batch_progress = BatchProgress {
            batch: batch_num,
            total_batches,
            thumbnails,
            progress,
        };

        app.emit("import-batch", batch_progress)
            .map_err(|e| format!("Failed to emit event: {}", e))?;

        let batch_duration = batch_start.elapsed();
        println!(
            "Batch {} complete: {:.1}% total progress, took {:.2}s, {:.1} images/sec",
            batch_num + 1,
            progress,
            batch_duration.as_secs_f32(),
            batch_count as f32 / batch_duration.as_secs_f32()
        );
    }

    let total_duration = start_time.elapsed();
    println!(
        "Import complete! Processed {} images in {:.2}s ({:.1} images/sec)",
        total,
        total_duration.as_secs_f32(),
        total as f32 / total_duration.as_secs_f32()
    );
    Ok(())
}

#[tauri::command]
async fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_data).map_err(|e| format!("Failed to create app data dir: {}", e))?;

    Ok(app_data.to_string_lossy().to_string())
}

#[tauri::command]
async fn copy_to_library(
    app: AppHandle,
    source_path: String,
    image_id: String,
) -> Result<String, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let library_dir = app_data.join("library");
    fs::create_dir_all(&library_dir)
        .map_err(|e| format!("Failed to create library directory: {}", e))?;

    let source = Path::new(&source_path);
    let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("jpg");

    let dest_path = library_dir.join(format!("{}.{}", image_id, extension));

    fs::copy(source, &dest_path).map_err(|e| format!("Failed to copy to library: {}", e))?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
fn generate_uuid() -> String {
    Uuid::new_v4().to_string()
}

#[tauri::command]
fn get_library_path(app: AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Check if custom path is stored in config
    let config_path = app_dir.join("config.json");
    if config_path.exists() {
        if let Ok(config_str) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
                if let Some(custom_path) = config.get("library_path").and_then(|p| p.as_str()) {
                    return Ok(custom_path.to_string());
                }
            }
        }
    }

    // Return default path
    let library_dir = app_dir.join("library");
    Ok(library_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn set_library_path(app: AppHandle, path: String) -> Result<(), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let config_path = app_dir.join("config.json");
    let config = serde_json::json!({ "library_path": path });

    fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

#[tauri::command]
fn get_default_library_path(app: AppHandle) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let library_dir = app_dir.join("library");
    Ok(library_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            browse_folder,
            count_folder_images,
            quick_scan,
            import_pack_progressive,
            get_app_data_dir,
            copy_to_library,
            generate_uuid,
            get_library_path,
            set_library_path,
            get_default_library_path,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
