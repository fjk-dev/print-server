const Renderer = {
    canvas: document.getElementById('mainCanvas'),
    ctx: null,
    lastRenderedPositions: {},

    _drawImage(type, content, currentY, isReal) {
        const parts = content.split('|');
        const id = parts[0].trim();
        const mode = parseInt(parts[1]) || 0;
        const x = parseInt(parts[2]) || 0;
        const y = parseInt(parts[3]) || 0;
        const r = parseInt(parts[4]) || 0;
        const s = parseFloat(parts[5]) || 1.0;
        const storageId = (type === 'QR') ? `qr_${id}` : id;

        let imgObj = ImageManager.storage[storageId];
        
        if (!imgObj && type === 'QR' && typeof QRCode !== 'undefined') {
            const qrCanvas = document.createElement('canvas');
            QRCode.toCanvas(qrCanvas, id, { width: 160, margin: 1 }, (err) => {
                if (!err) {
                    const qrImg = new Image();
                    qrImg.onload = () => {
                        ImageManager.storage[storageId] = qrImg;
                        if (typeof App !== 'undefined') App.updatePreview(); // перерисовка
                    };
                    qrImg.src = qrCanvas.toDataURL('image/png');
                }
            });
            return mode === 0 ? 175 : 0;
        }
        
        if (!imgObj && type === 'IMG') {
            if (id.startsWith('http')) {
                ImageManager.importImage(id, id).then(() => {
                    if (typeof App !== 'undefined') App.updatePreview();
                });
            }
            return mode === 0 ? 175 : 0;
        }
        
        if (!imgObj) return mode === 0 ? 175 : 0;

        const w = imgObj.width * s;
        const h = imgObj.height * s;
        let centerX, centerY;
        if (mode === 1) {
            centerX = x + w/2;
            centerY = y + h/2;
        } else {
            centerX = 384/2 + x;
            centerY = currentY + h/2;
        }

        if (isReal) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.translate(centerX, centerY);
            this.ctx.rotate(r * Math.PI / 180);
            this.ctx.drawImage(imgObj, -w/2, -h/2, w, h);
            if (storageId === ImageManager.selectedId) {
                this.ctx.strokeStyle = '#2c6e9e';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5,5]);
                this.ctx.strokeRect(-w/2 -2, -h/2 -2, w+4, h+4);
                this.ctx.setLineDash([]);
            }
            this.ctx.restore();
        }
        this.lastRenderedPositions[storageId] = { x: centerX - w/2, y: centerY - h/2, w, h, mode, r, s };
        return mode === 0 ? h + 10 : 0;
    },

    renderMarkdown(text, params) {
        this.lastRenderedPositions = {};
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        const { fontSize, lineSpacing, offsetX, fontFamily } = params;
        const lines = text.split('\n');
        let currentY = 20;
        let boxStartY = null, currentBoxType = 'solid';

        const drawPhase = (isReal) => {
            currentY = 20;
            boxStartY = null;
            for (let line of lines) {
                let clean = line.trim();
                if (clean === '') { currentY += fontSize; continue; }
                const imgMatch = clean.match(/^\[(IMG|QR):(.+?)\]$/);
                if (imgMatch) {
                    currentY += this._drawImage(imgMatch[1], imgMatch[2], currentY, isReal);
                    continue;
                }
                if (['---','===','~~~'].includes(clean)) {
                    if (isReal) this._drawLine(clean, currentY);
                    currentY += 15;
                    continue;
                }
                if (clean.includes('[BOX')) {
                    boxStartY = currentY;
                    currentBoxType = clean.includes(':dots') ? 'dots' : 'solid';
                    continue;
                }
                if (clean.includes('[/BOX]')) {
                    if (isReal && boxStartY !== null) {
                        this.ctx.lineWidth = 1.5;
                        this.ctx.strokeStyle = 'black';
                        this.ctx.setLineDash(currentBoxType === 'dots' ? [5,5] : []);
                        this.ctx.strokeRect(2, boxStartY-5, 380, currentY - boxStartY + 5);
                        this.ctx.setLineDash([]);
                    }
                    boxStartY = null;
                    currentY += 10;
                    continue;
                }
                
                let isCentered = clean.includes('[C]');
                let font = clean.includes('[M]') ? "'Roboto Mono', monospace" : fontFamily;
                let sizeMult = 1, isBold = false, indent = 0, bullet = null;
                clean = clean.replace(/\[C\]|\[M\]/g, '').trim();
                if (clean.startsWith('# ')) { sizeMult = 1.4; isBold = true; clean = clean.slice(2); }
                else if (clean.startsWith('## ')) { sizeMult = 1.2; isBold = true; clean = clean.slice(3); }
                else if (clean.startsWith('* ')) { bullet = '•'; indent = 20; clean = clean.slice(2); }
                else if (clean.startsWith('> ')) { bullet = '>'; indent = 20; clean = clean.slice(2); }

                const size = fontSize * sizeMult;
                const lineHeight = size * lineSpacing;
                this.ctx.font = `${isBold ? 'bold ' : ''}${size}px ${font}`;
                let lastX = isCentered ? (384 - this.ctx.measureText(clean).width)/2 : offsetX + indent;
                const startX = lastX;
                if (isReal) {
                    if (bullet === '•') this.ctx.fillText('•', startX-15, currentY);
                    else if (bullet === '>') {
                        this.ctx.fillStyle = '#aaa';
                        this.ctx.beginPath();
                        this.ctx.moveTo(startX-12, currentY);
                        this.ctx.lineTo(startX-4, currentY+size/2);
                        this.ctx.lineTo(startX-12, currentY+size);
                        this.ctx.fill();
                        this.ctx.fillStyle = 'black';
                    }
                    this.ctx.fillText(clean, lastX, currentY);
                }
                currentY += lineHeight;
            }
        };
        this.canvas.width = 384;
        drawPhase(false);
        this.canvas.height = currentY + 20;
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(0, 0, 384, this.canvas.height);
        this.ctx.fillStyle = "black";
        drawPhase(true);
    },

    _drawLine(type, y) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'black';
        if (type === '---') {
            this.ctx.moveTo(5, y+5); this.ctx.lineTo(379, y+5);
        } else if (type === '===') {
            this.ctx.moveTo(5, y+3); this.ctx.lineTo(379, y+3);
            this.ctx.moveTo(5, y+7); this.ctx.lineTo(379, y+7);
        } else {
            for (let x=5; x<379; x+=5) {
                this.ctx.moveTo(x, y+5 + Math.sin(x/5)*3);
                this.ctx.lineTo(x+2, y+5 + Math.sin((x+2)/5)*3);
            }
        }
        this.ctx.stroke();
    },

    getBitmapBytes() {
        const w = 384, h = this.canvas.height;
        const imgData = this.ctx.getImageData(0,0,w,h).data;
        const bytes = new Uint8Array((w/8)*h);
        for (let y=0; y<h; y++) {
            for (let x=0; x<w; x++) {
                const idx = (y*w + x)*4;
                if (imgData[idx] < 128) {
                    const byteIdx = y*(w/8) + Math.floor(x/8);
                    bytes[byteIdx] |= (1 << (x%8));
                }
            }
        }
        return { bytes, height: h };
    }
};
