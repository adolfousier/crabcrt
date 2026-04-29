const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
    const DURATION = 36000; // 36 seconds in ms
    const WIDTH = 1920;
    const HEIGHT = 1080;

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--autoplay-policy=no-user-gesture-required',
            '--window-size=1920,1080'
        ],
        defaultViewport: { width: WIDTH, height: HEIGHT }
    });

    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT });

    const htmlPath = path.join(__dirname, 'opencrabs-signal.html');
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

    // Force canvas to exact dimensions
    await page.evaluate((w, h) => {
        const canvas = document.getElementById('c');
        canvas.width = w;
        canvas.height = h;
        window.dispatchEvent(new Event('resize'));
    }, WIDTH, HEIGHT);
    await new Promise(r => setTimeout(r, 100));

    // Start recording via MediaRecorder in the page
    console.log('Starting MediaRecorder...');
    const webmPath = await page.evaluate(async (duration) => {
        return new Promise((resolve) => {
            const canvas = document.getElementById('c');
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 8000000
            });

            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.readAsDataURL(blob);
            };

            // Start animation and recording
            document.getElementById('start-overlay').click();
            recorder.start();

            // Stop after duration
            setTimeout(() => {
                recorder.stop();
            }, duration);
        });
    }, DURATION);

    await browser.close();

    // Save webm
    const base64Data = webmPath.replace(/^data:video\/webm;base64,/, '');
    const webmBuffer = Buffer.from(base64Data, 'base64');
    const webmFile = path.join(__dirname, '..', 'tmp-export.webm');
    fs.writeFileSync(webmFile, webmBuffer);

    console.log(`WebM saved: ${webmFile} (${(webmBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

    // Mux with audio using ffmpeg
    const audioPath = path.join(__dirname, 'assets', 'opencrabs-release.wav');
    const outputPath = path.join(__dirname, '..', 'opencrabs-v0.3.15.mp4');

    console.log('Muxing with ffmpeg...');
    const ffmpegCmd = [
        'ffmpeg', '-y',
        '-i', webmFile,
        '-i', audioPath,
        '-r', '30',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-crf', '23',
        '-preset', 'fast',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-shortest',
        outputPath
    ];

    execSync(ffmpegCmd.join(' '), { stdio: 'inherit' });

    // Cleanup
    fs.unlinkSync(webmFile);

    const stats = fs.statSync(outputPath);
    console.log(`Done! ${outputPath}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
})();
