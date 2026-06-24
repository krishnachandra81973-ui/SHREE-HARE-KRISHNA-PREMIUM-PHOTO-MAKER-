/**
 * Client-side background removal using a border-connected queue-based flood fill algorithm.
 * Excellent for solid or semi-solid background images typically used for passport photos.
 * Supports custom background colors and soft-edge feathering for a clean cut-out.
 */
export async function removeBackgroundClient(
  imageSrc: string, 
  tolerance: number = 32,
  customBgColor?: { r: number; g: number; b: number },
  autoCleanSpots: boolean = true
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = (e) => reject(e);
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context");

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imgData.data;
  const width = img.width;
  const height = img.height;

  let bgR = 240;
  let bgG = 240;
  let bgB = 240;

  if (customBgColor) {
    bgR = customBgColor.r;
    bgG = customBgColor.g;
    bgB = customBgColor.b;
  } else {
    // Sample background color from corners (average of 5x5 regions in top-left and top-right)
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    const sampleSize = 5;
    for (let y = 5; y < 5 + sampleSize; y++) {
      for (let x = 5; x < 5 + sampleSize; x++) {
        if (x < width && y < height) {
          // Top-left corner
          const idx1 = (y * width + x) * 4;
          rSum += data[idx1];
          gSum += data[idx1 + 1];
          bSum += data[idx1 + 2];
          
          // Top-right corner
          const idx2 = (y * width + (width - 1 - x)) * 4;
          rSum += data[idx2];
          gSum += data[idx2 + 1];
          bSum += data[idx2 + 2];
          count += 2;
        }
      }
    }
    if (count > 0) {
      bgR = Math.round(rSum / count);
      bgG = Math.round(gSum / count);
      bgB = Math.round(bSum / count);
    }
  }

  // Queue-based flood fill
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Helper to push coordinate
  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pos = y * width + x;
    if (visited[pos]) return;
    visited[pos] = 1;

    const idx = pos * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
    if (dist <= tolerance) {
      queue.push(pos);
    }
  };

  // Add all border pixels (top, left, right, and bottom-corners edges) as seeds
  for (let x = 0; x < width; x++) {
    enqueue(x, 0); // Top edge
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y); // Left edge
    enqueue(width - 1, y); // Right edge
  }
  // Bottom-left and bottom-right corner regions as potential background seeds
  const cornerWidth = Math.min(20, Math.floor(width * 0.1));
  for (let x = 0; x < cornerWidth; x++) {
    enqueue(x, height - 1);
    enqueue(width - 1 - x, height - 1);
  }

  // Process queue
  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    const x = pos % width;
    const y = Math.floor(pos / width);

    // Make the pixel fully transparent
    const idx = pos * 4;
    data[idx + 3] = 0; // Set Alpha to 0

    // Check neighbors (4-connectivity)
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  // Pass 2: Connected Component Analysis to remove small isolated "dots" or islands in the background.
  // Any foreground (alpha > 0) island that is very small (e.g. less than 0.2% of the image area or less than 1500 pixels)
  // is considered a stray background dot, noise speck, or shadow artifact and will be completely wiped.
  if (autoCleanSpots) {
    const visitedForeground = new Uint8Array(width * height);
    const minIslandSize = Math.max(150, Math.floor(width * height * 0.003)); // 0.3% of the image area

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        const idx = pos * 4;

        // If it is a foreground pixel (alpha > 0) and not yet visited
        if (data[idx + 3] > 0 && !visitedForeground[pos]) {
          const component: number[] = [];
          const islandQueue: number[] = [pos];
          visitedForeground[pos] = 1;

          let islandHead = 0;
          while (islandHead < islandQueue.length) {
            const currentPos = islandQueue[islandHead++];
            component.push(currentPos);

            const cx = currentPos % width;
            const cy = Math.floor(currentPos / width);

            // Check 4-neighbors
            const neighbors = [
              { nx: cx - 1, ny: cy },
              { nx: cx + 1, ny: cy },
              { nx: cx, ny: cy - 1 },
              { nx: cx, ny: cy + 1 }
            ];

            for (const { nx, ny } of neighbors) {
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nPos = ny * width + nx;
                const nIdx = nPos * 4;
                if (data[nIdx + 3] > 0 && !visitedForeground[nPos]) {
                  visitedForeground[nPos] = 1;
                  islandQueue.push(nPos);
                }
              }
            }
          }

          // If the island size is smaller than the threshold, make all of its pixels transparent
          if (component.length < minIslandSize) {
            for (const p of component) {
              data[p * 4 + 3] = 0;
            }
          }
        }
      }
    }
  }

  // Soft-edge feathering step: smooth out the alpha boundary to avoid jaggy cuts
  const alphaMap = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alphaMap[i] = data[i * 4 + 3];
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pos = y * width + x;
      if (alphaMap[pos] === 255) {
        // Count transparent neighbors
        let transNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (alphaMap[(y + dy) * width + (x + dx)] === 0) {
              transNeighbors++;
            }
          }
        }

        if (transNeighbors > 0) {
          // Dynamic alpha based on transparent neighborhood density
          // Fewer transparent neighbors -> slightly higher alpha (more opaque)
          // More transparent neighbors -> lower alpha (more transparent)
          const idx = pos * 4;
          data[idx + 3] = Math.round(255 * (1 - transNeighbors / 12));
        }
      }
    }
  }

  // Draw the modified image data back to the canvas
  ctx.putImageData(imgData, 0, 0);

  return canvas.toDataURL("image/png");
}
