const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
    const htmlPath = process.argv[2];
    const outputPath = process.argv[3] || 'opencrabs-export.webm';
    const audioPath = process.argv[4];
    const durationSecs = 37;

    if (!htmlPath) {
        console.error('Usage: node export.js <html> <output.mp4> <audio.wav>');
        process.exit(1);
    }

    const htmlUrl = htmlPath.startsWith('http') ? htmlPath : `file://${path.resolve(htmlPath)}`;

    console.log(`📹 Opening: ${htmlUrl}`);
    console.log(`⏱  Recording ${durationSecs}s at 60fps`);

    const webmPath = outputPath.replace('.mp4', '-raw.webm');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-features=VizDisplayCompositor',
        ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(htmlUrl, { waitUntil: 'networkidle0' });

    // Start recording via MediaRecorder
    const webmBuffer = await page.evaluate(async (secs) => {
        return new Promise((resolve) => {
            // Hide overlay and start animation
            const overlay = document.getElementById('start-overlay');
            if (overlay) overlay.style.display = 'none';
            window.start = performance.now();

            // Capture canvas stream
            const stream = document.getElementById('c').captureStream(60);
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 8000000,
            });

            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                blob.arrayBuffer().then((buf) => {
                    // Convert to base64
                    const bytes = new Uint8Array(buf);
                    let binary = '';
                    // Process in chunks to avoid call stack overflow
                    const CHUNK = 8192;
                    for (let i = 0; i < bytes.length; i += CHUNK) {
                        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
                    }
                    resolve(btoa(binary));
                });
            };

            recorder.start();
            setTimeout(() => recorder.stop(), secs * 1000);
        });
    }, durationSecs);

    await browser.close();

    // Write WebM file
    const webmBuf = Buffer.from(webmBuffer, 'base64');
    fs.writeFileSync(webmPath, webmBuf);
    console.log(`✅ WebM saved: ${webmPath} (${(webmBuf.length / 1024 / 1024).toFixed(1)}MB)`);

    // Mux with audio if provided
    if (audioPath) {
        const audioAbs = path.resolve(audioPath);
        console.log('🔨 Muxing with audio...');
        execSync(
            `ffmpeg -y -i "${webmPath}" -i "${audioAbs}" ` +
            `-c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`,
            { stdio: 'inherit' }
        );
        console.log(`🎉 Output: ${path.resolve(outputPath)}`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
