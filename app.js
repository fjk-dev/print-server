const App = {
    currentDriver: null,
    activeTab: 'markdown',
    selectedId: null,

    init() {
        this.fillDrivers();
        this.bindEvents();
        this.updatePreview();
        this.canvas = document.getElementById('mainCanvas');
        
        this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
        this.canvas.addEventListener('mousedown', (e) => this.onDragStart(e));
        window.addEventListener('mousemove', (e) => this.onDragMove(e));
        window.addEventListener('mouseup', () => this.onDragEnd());
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        const textarea = document.getElementById('textInput');
        textarea.addEventListener('input', () => this.updatePreview());
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            if (e.target.files[0]) {
                const id = await ImageManager.importImage(e.target.files[0]);
                if (id) {
                    const tag = `[IMG:${id}|0|0|0|0|1.0]`;
                    this.insertTagAtCursor(tag);
                }
            }
        };
        document.getElementById('uploadBtn').onclick = () => fileInput.click();
        document.getElementById('urlBtn').onclick = async () => {
            const url = prompt('Введите URL картинки:');
            if (url) {
                const id = await ImageManager.importImage(url);
                if (id) {
                    const tag = `[IMG:${id}|0|0|0|0|1.0]`;
                    this.insertTagAtCursor(tag);
                }
            }
        };
        
        document.getElementById('printBtn').onclick = () => this.printViaWebBT();
        document.getElementById('resetPreviewBtn').onclick = () => this.updatePreview();
        document.getElementById('imgMode').onchange = () => this.applyImgChanges();
        document.getElementById('imgScale').oninput = () => this.applyImgChanges();
        document.getElementById('imgRotate').oninput = () => this.applyImgChanges();
        document.getElementById('imgOffsetX').oninput = () => this.applyImgChanges();
        document.getElementById('fontSize').oninput = () => this.updatePreview();
        document.getElementById('offsetX').oninput = () => this.updatePreview();
        document.getElementById('lineSpacing').oninput = () => this.updatePreview();
        document.getElementById('fontFamily').onchange = () => this.updatePreview();
        
        const brightnessSlider = document.getElementById('brightness');
        const contrastSlider = document.getElementById('contrast');
        const methodSelect = document.getElementById('ditherMethod');
        const applyBtn = document.getElementById('applyImgSettingsBtn');
        
        const updateImageSettings = () => {
            if (!ImageManager.selectedId) {
                console.log("Нет выбранного изображения");
                return;
            }
            const brightness = parseInt(brightnessSlider.value);
            const contrast = parseFloat(contrastSlider.value);
            const method = methodSelect.value;
            document.getElementById('brightnessVal').innerText = brightness;
            document.getElementById('contrastVal').innerText = contrast;
            ImageManager.reprocessCurrentImage({ brightness, contrast, method });
        };
        
        if (brightnessSlider) brightnessSlider.addEventListener('input', updateImageSettings);
        if (contrastSlider) contrastSlider.addEventListener('input', updateImageSettings);
        if (methodSelect) methodSelect.addEventListener('change', updateImageSettings);
        if (applyBtn) applyBtn.addEventListener('click', updateImageSettings);
        
        document.getElementById('sw-ru').onclick = () => this.setLanguage('ru');
        document.getElementById('sw-en').onclick = () => this.setLanguage('en');
        
        this.dragTarget = null;
        this.dragOffset = { x: 0, y: 0 };
        this.isDragging = false;
    },

    fillDrivers() {
        const sel = document.getElementById('driverSelect');
        for (let k in PrinterRegistry) {
            sel.add(new Option(PrinterRegistry[k].name, k));
        }
    },

    bindEvents() {
        document.getElementById('connectBtn').onclick = async () => {
            const key = document.getElementById('driverSelect').value;
            this.currentDriver = PrinterRegistry[key].driver;
            try {
                const name = await this.currentDriver.connect();
                document.getElementById('status').innerHTML = `✅ ${name}`;
                document.getElementById('printBtn').disabled = false;
            } catch(e) {
                alert('Ошибка: ' + e.message);
            }
        };
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeTab = btn.dataset.tab;
                document.getElementById('markdown-tab').classList.toggle('hidden', this.activeTab !== 'markdown');
                document.getElementById('visual-tab').classList.toggle('hidden', this.activeTab !== 'visual');
                if (this.activeTab === 'visual') ImageManager.updateUI();
                this.updatePreview();
            };
        });
    },

    updatePreview() {
        const params = {
            fontSize: parseInt(document.getElementById('fontSize').value),
            lineSpacing: parseFloat(document.getElementById('lineSpacing').value),
            offsetX: parseInt(document.getElementById('offsetX').value),
            fontFamily: document.getElementById('fontFamily').value
        };
        document.getElementById('fontSizeVal').innerText = params.fontSize;
        document.getElementById('lineSpacingVal').innerText = params.lineSpacing;
        document.getElementById('offsetXValParam').innerText = params.offsetX;
        const text = document.getElementById('textInput').value;
        Renderer.renderMarkdown(text, params);
    },

    onCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        const target = ImageManager.findImageAt(mx, my);
        if (target) {
            this.selectImage(target.id);
        } else {
            this.deselectImage();
        }
    },

    onDragStart(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        const target = ImageManager.findImageAt(mx, my);
        if (target) {
            this.selectedId = target.id;
            ImageManager.selectedId = target.id;
            this.dragTarget = target;
            this.dragOffset = { x: mx - target.x, y: my - target.y };
            this.isDragging = false;
            this.updatePreview();
            this.syncControls(target);
            document.getElementById('imgControls').classList.remove('hidden');
            e.preventDefault();
        }
    },

    onDragMove(e) {
        if (!this.dragTarget) return;
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        const newX = mx - this.dragOffset.x;
        const newY = my - this.dragOffset.y;
        if (!this.isDragging && (Math.abs(newX - this.dragTarget.x) > 3 || Math.abs(newY - this.dragTarget.y) > 3)) {
            this.isDragging = true;
        }
        if (this.isDragging) {
            this.dragTarget.x = newX;
            this.dragTarget.y = newY;
            this.updateObjectInText(this.dragTarget);
            this.syncControls(this.dragTarget);
            this.updatePreview();
        }
    },

    onDragEnd() {
        this.dragTarget = null;
        this.isDragging = false;
    },

    selectImage(id) {
        this.selectedId = id;
        ImageManager.selectedId = id;
        const pos = Renderer.lastRenderedPositions[id];
        if (pos) {
            const imgData = {
                id: id,
                mode: pos.mode,
                x: pos.x,
                y: pos.y,
                rotate: pos.r,
                scale: pos.s
            };
            this.syncControls(imgData);
            document.getElementById('imgControls').classList.remove('hidden');
        } else {
            document.getElementById('imgControls').classList.add('hidden');
        }
        ImageManager.updateUI();
        this.updatePreview();
    },

    deselectImage() {
        this.selectedId = null;
        ImageManager.selectedId = null;
        document.getElementById('imgControls').classList.add('hidden');
        ImageManager.updateUI();
        this.updatePreview();
    },

    syncControls(imgData) {
        document.getElementById('imgMode').checked = (imgData.mode === 0);
        document.getElementById('imgScale').value = imgData.scale;
        document.getElementById('imgRotate').value = imgData.rotate;
        document.getElementById('imgOffsetX').value = imgData.x;
        document.getElementById('scaleVal').innerText = imgData.scale.toFixed(2);
        document.getElementById('rotateVal').innerText = imgData.rotate + '°';
        document.getElementById('offsetXVal').innerText = imgData.x;
    },

    applyImgChanges() {
        if (!this.selectedId) return;
        const mode = document.getElementById('imgMode').checked ? 0 : 1;
        const scale = parseFloat(document.getElementById('imgScale').value);
        const rotate = parseInt(document.getElementById('imgRotate').value);
        const offsetX = parseInt(document.getElementById('imgOffsetX').value);
        const currentPos = Renderer.lastRenderedPositions[this.selectedId];
        if (!currentPos) return;
        const y = currentPos.y;
        const tag = `[IMG:${this.selectedId}|${mode}|${offsetX}|${Math.round(y)}|${rotate}|${scale}]`;
        this.updateTagInText(this.selectedId, tag);
        this.updatePreview();
        document.getElementById('scaleVal').innerText = scale.toFixed(2);
        document.getElementById('rotateVal').innerText = rotate + '°';
        document.getElementById('offsetXVal').innerText = offsetX;
    },

    updateTagInText(id, newTag) {
        const textarea = document.getElementById('textInput');
        const lines = textarea.value.split('\n');
        const newLines = lines.map(line => {
            if (line.includes(`[IMG:${id}|`) || line.includes(`[QR:${id}|`)) {
                return newTag;
            }
            return line;
        });
        textarea.value = newLines.join('\n');
    },

    updateObjectInText(obj) {
        const tag = `[IMG:${obj.id}|${obj.mode}|${Math.round(obj.x)}|${Math.round(obj.y)}|${obj.rotate}|${obj.scale}]`;
        this.updateTagInText(obj.id, tag);
    },

    handlePaste(e) {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = item.getAsFile();
                ImageManager.importImage(blob).then(id => {
                    if (id) {
                        const tag = `[IMG:${id}|0|0|0|0|1.0]`;
                        this.insertTagAtCursor(tag);
                        this.updatePreview();
                    }
                });
                break;
            }
        }
    },

    insertTagAtCursor(tag) {
        const textarea = document.getElementById('textInput');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const prefix = (start > 0 && text[start-1] !== '\n') ? '\n' : '';
        const suffix = (end < text.length && text[end] !== '\n') ? '\n' : '';
        textarea.value = text.slice(0, start) + prefix + tag + suffix + text.slice(end);
        textarea.focus();
        this.updatePreview();
    },

    async printViaWebBT() {
        if (!this.currentDriver) {
            alert('Сначала подключите принтер');
            return;
        }
        const { bytes, height } = Renderer.getBitmapBytes();
        document.getElementById('printBtn').disabled = true;
        document.getElementById('printStatus').innerText = 'Печать...';
        try {
            await this.currentDriver.print(bytes, height);
            document.getElementById('printStatus').innerText = 'Готово';
        } catch(e) {
            alert('Ошибка печати: ' + e.message);
            document.getElementById('printStatus').innerText = 'Ошибка';
        } finally {
            document.getElementById('printBtn').disabled = false;
        }
    },

    setLanguage(lang) {
        const ruTexts = document.querySelectorAll('[lang-ru]');
        const enTexts = document.querySelectorAll('[lang-en]');
        if (lang === 'en') {
            ruTexts.forEach(el => el.style.display = 'none');
            enTexts.forEach(el => el.style.display = 'inline');
            document.getElementById('sw-ru').classList.remove('active');
            document.getElementById('sw-en').classList.add('active');
        } else {
            ruTexts.forEach(el => el.style.display = 'inline');
            enTexts.forEach(el => el.style.display = 'none');
            document.getElementById('sw-en').classList.remove('active');
            document.getElementById('sw-ru').classList.add('active');
        }
    }
};

ImageManager.findImageAt = function(mx, my) {
    const ids = Object.keys(Renderer.lastRenderedPositions);
    for (let i = ids.length-1; i >=0; i--) {
        const id = ids[i];
        const p = Renderer.lastRenderedPositions[id];
        if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
            return { id, mode: p.mode, x: p.x, y: p.y, rotate: p.r, scale: p.s };
        }
    }
    return null;
};
