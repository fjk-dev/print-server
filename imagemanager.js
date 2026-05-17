const ImageManager = {
    storage: {},
    originalBlobs: {},
    selectedId: null,

    _orderedDither(lum, width, height) {
        const bayer = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
        const factor = 255/16;
        const res = new Uint8Array(lum.length);
        for (let y=0; y<height; y++)
            for (let x=0; x<width; x++) {
                const idx = y*width + x;
                res[idx] = lum[idx] < bayer[y%4][x%4]*factor ? 0 : 255;
            }
        return res;
    },
    _floydDither(lum, width, height) {
        const l = new Uint8Array(lum);
        const clamp = v => Math.min(255, Math.max(0, v));
        for (let y=0; y<height; y++)
            for (let x=0; x<width; x++) {
                const idx = y*width + x;
                const old = l[idx];
                const newVal = old < 128 ? 0 : 255;
                l[idx] = newVal;
                const err = old - newVal;
                if (x+1 < width) l[idx+1] = clamp(l[idx+1] + err * 7/16);
                if (y+1 < height) {
                    if (x-1 >= 0) l[idx+width-1] = clamp(l[idx+width-1] + err * 3/16);
                    l[idx+width] = clamp(l[idx+width] + err * 5/16);
                    if (x+1 < width) l[idx+width+1] = clamp(l[idx+width+1] + err * 1/16);
                }
            }
        return l;
    },
    _simpleBinarize(lum, w, h) {
        const res = new Uint8Array(lum.length);
        for (let i=0; i<lum.length; i++) res[i] = lum[i] < 128 ? 0 : 255;
        return res;
    },

    async processWithOptions(blob, id, { method='ordered', brightness=0, contrast=1.0 }) {
        const url = URL.createObjectURL(blob);
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const scale = 384 / img.width;
                const w = 384;
                const h = Math.floor(img.height * scale);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = w; canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);
                const data = ctx.getImageData(0,0,w,h).data;
                let lum = new Uint8Array(w*h);
                for (let i=0; i<data.length; i+=4) {
                    let y = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
                    y = y + brightness;
                    y = 128 + (y-128)*contrast;
                    y = Math.min(255, Math.max(0, y));
                    lum[i/4] = y;
                }
                let final;
                if (method === 'ordered') final = this._orderedDither(lum, w, h);
                else if (method === 'floyd') final = this._floydDither(lum, w, h);
                else final = this._simpleBinarize(lum, w, h);
                const outCanvas = document.createElement('canvas');
                const outCtx = outCanvas.getContext('2d');
                outCanvas.width = w; outCanvas.height = h;
                const outData = outCtx.createImageData(w, h);
                for (let i=0; i<final.length; i++) {
                    outData.data[i*4] = final[i];
                    outData.data[i*4+1] = final[i];
                    outData.data[i*4+2] = final[i];
                    outData.data[i*4+3] = 255;
                }
                outCtx.putImageData(outData, 0, 0);
                const finalImg = new Image();
                finalImg.src = outCanvas.toDataURL('image/png');
                finalImg.onload = () => {
                    this.storage[id] = finalImg;
                    URL.revokeObjectURL(url);
                    this.updateUI();
                    if (typeof App !== 'undefined') App.updatePreview();
                    resolve(finalImg);
                };
            };
            img.src = url;
        });
    },

    async importImage(source, customId = null) {
        let id = customId || `img_${Date.now()}`;
        let blob;
        if (source instanceof File || source instanceof Blob) blob = source;
        else {
            // ИСПРАВЛЕНО: используем /loadimg вместо loadimg.php
            const proxyUrl = `/loadimg?url=${encodeURIComponent(source)}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error('Ошибка загрузки');
            blob = await res.blob();
        }
        this.originalBlobs[id] = blob;
        const brightness = parseInt(document.getElementById('brightness')?.value || 0);
        const contrast = parseFloat(document.getElementById('contrast')?.value || 1.0);
        const method = document.getElementById('ditherMethod')?.value || 'ordered';
        await this.processWithOptions(blob, id, { method, brightness, contrast });
        return id;
    },

    async reprocessCurrentImage({ brightness, contrast, method }) {
        if (!this.selectedId) return;
        const blob = this.originalBlobs[this.selectedId];
        if (!blob) return;
        await this.processWithOptions(blob, this.selectedId, { method, brightness, contrast });
    },

    updateUI() {
        const container = document.getElementById('dropZone');
        if (!container) return;
        let html = '';
        for (let id in this.storage) {
            const selected = (this.selectedId === id) ? 'selected' : '';
            html += `<div class="gallery-item ${selected}" data-id="${id}">
                        <img src="${this.storage[id].src}" alt="${id}">
                     </div>`;
        }
        container.innerHTML = html || '<div class="empty-gallery">Нет изображений</div>';
        document.querySelectorAll('.gallery-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.dataset.id;
                if (typeof App !== 'undefined' && App.selectImage) App.selectImage(id);
                else { this.selectedId = id; this.updateUI(); if (typeof App !== 'undefined') App.updatePreview(); }
            });
        });
    },

    get(id) { return this.storage[id] || null; }
};