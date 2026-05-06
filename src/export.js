const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
    const FPS = 30;
    const DURATION = 36;
    const WIDTH = 1280;
    const HEIGHT = 720;
    const TOTAL_FRAMES = FPS * DURATION;
    const FRAME_DIR = path.join(__dirname, '..', 'tmp-frames');

    // Clean up old frames
    if (fs.existsSync(FRAME_DIR)) fs.rmSync(FRAME_DIR, { recursive: true });
    fs.mkdirSync(FRAME_DIR, { recursive: true });

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080'
        ],
        defaultViewport: { width: WIDTH, height: HEIGHT }
    });

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT });

    const htmlPath = path.join(__dirname, 'opencrabs-signal.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Force canvas size and start animation
    await page.evaluate((w, h) => {
        const canvas = document.getElementById('c');
        if (canvas) {
            canvas.width = w;
            canvas.height = h;
            window.dispatchEvent(new Event('resize'));
        }
    }, WIDTH, HEIGHT);
    await new Promise(r => setTimeout(r, 300));

    // Click overlay if it exists, otherwise the animation auto-starts
    const hasOverlay = await page.evaluate(() => !!document.getElementById('start-overlay'));
    if (hasOverlay) {
        await page.click('#start-overlay');
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`Capturing ${TOTAL_FRAMES} frames at ${FPS}fps...`);
    for (let i = 0; i < TOTAL_FRAMES; i++) {
        // Render frame at specific timestamp using renderFrameAt if available
        await page.evaluate((ms) => {
            if (typeof window.renderFrameAt === 'function') {
                window.renderFrameAt(ms);
            }
        }, (i / FPS) * 1000);

        const framePath = path.join(FRAME_DIR, `frame_${String(i).padStart(5, '0')}.png`);
        await page.screenshot({ path: framePath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });

        if (i % 100 === 0) console.log(`  Frame ${i}/${TOTAL_FRAMES}`);
    }

    await browser.close();

    // Encode MP4
    const outputPath = path.join(__dirname, '..', 'opencrabs-v0.3.16.mp4');
    console.log('Encoding with ffmpeg...');
    execSync(
        `ffmpeg -y -framerate ${FPS} -i "${FRAME_DIR}/frame_%05d.png" ` +
        `-c:v libx264 -pix_fmt yuv420p -crf 20 -preset fast -movflags +faststart "${outputPath}"`,
        { stdio: 'inherit' }
    );

    // Clean up frames
    fs.rmSync(FRAME_DIR, { recursive: true });

    const stats = fs.statSync(outputPath);
    console.log(`Done! ${outputPath}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
})();
