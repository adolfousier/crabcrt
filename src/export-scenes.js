const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const SCENES = [
    { file: 'scene-01-intro.html', duration: 6 },
    { file: 'scene-02-version.html', duration: 5 },
    { file: 'scene-03-features.html', duration: 14 },
    { file: 'scene-04-cta.html', duration: 7 }
];

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const BASE_DIR = path.join(__dirname, '..', 'tmp-frames');
const PORT = 18932;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Tiny static file server — solves CORS tainting for toDataURL()
function startServer(dir, port) {
    return new Promise((resolve) => {
        const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
        const server = http.createServer((req, res) => {
            let filePath = path.join(dir, req.url === '/' ? 'index.html' : req.url);
            const ext = path.extname(filePath);
            res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            fs.readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); res.end('not found'); return; }
                res.writeHead(200);
                res.end(data);
            });
        });
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

(async () => {
    // Clean up
    if (fs.existsSync(BASE_DIR)) fs.rmSync(BASE_DIR, { recursive: true });
    fs.mkdirSync(BASE_DIR, { recursive: true });

    // Start local HTTP server
    console.log(`Starting local server on http://127.0.0.1:${PORT}`);
    const server = await startServer(__dirname, PORT);

    console.log('Launching browser (headless)...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', `--window-size=${WIDTH},${HEIGHT}`],
        defaultViewport: { width: WIDTH, height: HEIGHT }
    });

    let globalFrame = 0;

    for (const scene of SCENES) {
        const totalFrames = Math.round(scene.duration * FPS);
        console.log(`\nRendering ${scene.file} (${scene.duration}s, ${totalFrames} frames)...`);

        const page = await browser.newPage();
        await page.setViewport({ width: WIDTH, height: HEIGHT });

        // Load via HTTP — no CORS tainting
        await page.goto(`http://127.0.0.1:${PORT}/${scene.file}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Force canvas resize in headless mode
        await page.evaluate((w, h) => {
            window.W = w;
            window.H = h;
            if (typeof window.resize === 'function') window.resize();
        }, WIDTH, HEIGHT);

        // Wait for web fonts (Press Start 2P) to fully load before capturing
        await page.evaluate(() => document.fonts.ready);
        await sleep(1500); // extra buffer for headless canvas font application

        // Verify canvas dimensions
        const dims = await page.evaluate(() => {
            const m = document.getElementById('main');
            return { w: m?.width || 0, h: m?.height || 0 };
        });
        if (dims.w === 0 || dims.h === 0) {
            console.error(`  ERROR: Canvas is 0x0!`);
            await page.close();
            continue;
        }
        console.log(`  Canvas verified: ${dims.w}x${dims.h}`);

        // Drive animation + capture via toDataURL (no compositing race, no screenshot overhead)
        for (let i = 0; i < totalFrames; i++) {
            const t = i / FPS;
            const dataUrl = await page.evaluate((time) => {
                if (typeof window.renderFrame === 'function') {
                    window.renderFrame(time);
                }
                // Composite bg + main onto single canvas
                const bg = document.getElementById('bg');
                const main = document.getElementById('main');
                const composite = document.createElement('canvas');
                composite.width = bg.width;
                composite.height = bg.height;
                const cCtx = composite.getContext('2d');
                cCtx.drawImage(bg, 0, 0);
                cCtx.drawImage(main, 0, 0);
                return composite.toDataURL('image/png');
            }, t);

            const base64 = dataUrl.split(',')[1];
            const framePath = path.join(BASE_DIR, `frame_${String(globalFrame).padStart(5, '0')}.png`);
            fs.writeFileSync(framePath, Buffer.from(base64, 'base64'));
            globalFrame++;
            if (i % 50 === 0) console.log(`  Frame ${i}/${totalFrames} (t=${t.toFixed(2)}s)`);
        }

        await page.close();
    }

    await browser.close();
    server.close();

    // Encode MP4
    const outputPath = path.join(__dirname, '..', 'opencrabs-v0.3.17-retro.mp4');
    console.log(`\nEncoding ${globalFrame} frames with ffmpeg...`);
    execSync(
        `ffmpeg -y -framerate ${FPS} -i "${BASE_DIR}/frame_%05d.png" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -movflags +faststart "${outputPath}"`,
        { stdio: 'inherit' }
    );

    // Clean up frames
    fs.rmSync(BASE_DIR, { recursive: true });

    const stats = fs.statSync(outputPath);
    console.log(`\nDone! ${outputPath}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Duration: ${(globalFrame / FPS).toFixed(1)}s`);
    console.log(`Expected: ${SCENES.reduce((a, s) => a + s.duration, 0)}s`);
})();
