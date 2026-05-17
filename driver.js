// Реальный драйвер MXW01 / Lefuxin (исправленная версия)
class LefuxinDriver {
    constructor() {
        this.device = null;
        this.ctrl = null;
        this.data = null;
    }

    async connect() {
        try {
            console.log("Запуск подключения...");
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    '0000ae30-0000-1000-8000-00805f9b34fb',
                    '0000ae00-0000-1000-8000-00805f9b34fb',
                    '0000ff00-0000-1000-8000-00805f9b34fb',
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455'
                ]
            });
            const server = await this.device.gatt.connect();
            await new Promise(r => setTimeout(r, 600));
            const services = await server.getPrimaryServices();
            this.ctrl = null;
            this.data = null;
            for (let service of services) {
                try {
                    const c = await service.getCharacteristic('0000ae01-0000-1000-8000-00805f9b34fb');
                    const d = await service.getCharacteristic('0000ae03-0000-1000-8000-00805f9b34fb');
                    if (c && d) {
                        this.ctrl = c;
                        this.data = d;
                        console.log("Порты найдены в сервисе:", service.uuid);
                        return this.device.name || "MXW01 Printer";
                    }
                } catch(e) { continue; }
            }
            throw new Error("Не найдены каналы управления AE01/AE03");
        } catch(e) {
            console.error(e);
            throw e;
        }
    }

    _crc(d) {
        let c = 0;
        for (let b of d) {
            c ^= b;
            for (let i=0; i<8; i++) c = (c & 0x80) ? ((c << 1) ^ 0x07) & 0xFF : (c << 1) & 0xFF;
        }
        return c;
    }

    async print(bytes, h) {
        if (!this.ctrl || !this.data) throw new Error("Принтер не подключён");
        const send = async (id, p) => {
            const d = new Uint8Array(p);
            const pkt = new Uint8Array([0x22, 0x21, id, 0x00, d.length & 0xFF, (d.length>>8)&0xFF, ...d, this._crc(d), 0xFF]);
            await this.ctrl.writeValueWithoutResponse(pkt);
            await new Promise(r => setTimeout(r, 50));
        };
        await send(0xB1, [0x00]);
        await send(0xA9, [h & 0xFF, (h>>8)&0xFF, 48, 0]);
        for (let i=0; i<bytes.length; i+=20) {
            await this.data.writeValueWithoutResponse(bytes.slice(i, i+20));
            if (i % 400 === 0) await new Promise(r => setTimeout(r, 20));
        }
        await send(0xAD, [0x00]);
    }
}

// ESC/POS драйвер
class ESCPOSDriver {
    constructor() {
        this.txChar = null;
    }
    async connect() {
        console.log("Поиск ESC/POS принтера...");
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '49535343-fe7d-4ae5-8fa9-9fafd205e455'
            ]
        });
        const server = await device.gatt.connect();
        const services = await server.getPrimaryServices();
        for (let s of services) {
            try {
                if (s.uuid === '000018f0-0000-1000-8000-00805f9b34fb') {
                    this.txChar = await s.getCharacteristic('00002af0-0000-1000-8000-00805f9b34fb');
                } else if (s.uuid === '49535343-fe7d-4ae5-8fa9-9fafd205e455') {
                    this.txChar = await s.getCharacteristic('49535343-8841-43f4-a8d4-ecbe34729bb3');
                }
                if (this.txChar) break;
            } catch(e) {}
        }
        if (!this.txChar) throw new Error("Не найден канал ESC/POS");
        return device.name || "ESC/POS Printer";
    }
    async print(bytes, h) {
        for (let i=0; i<bytes.length; i+=20) {
            await this.txChar.writeValueWithoutResponse(bytes.slice(i, i+20));
            if (i % 100 === 0) await new Promise(r => setTimeout(r, 10));
        }
    }
}

// Универсальный драйвер для автовыбора
class UniversalPrinterDriver {
    constructor() {
        this.driver = null;
    }
    async connect() {
        const testDrivers = [new LefuxinDriver(), new ESCPOSDriver()];
        for (let drv of testDrivers) {
            try {
                const name = await drv.connect();
                this.driver = drv;
                return name;
            } catch(e) {}
        }
        throw new Error("Не удалось определить тип принтера");
    }
    async print(bytes, h) {
        if (!this.driver) throw new Error("Драйвер не инициализирован");
        await this.driver.print(bytes, h);
    }
}

// Реестр драйверов для выбора в интерфейсе
const PrinterRegistry = {
    "mxw01": { name: "MXW01 / Lefuxin", driver: new LefuxinDriver() },
    "escpos": { name: "ESC/POS (экспериментально)", driver: new ESCPOSDriver() },
    "universal": { name: "Автоопределение", driver: new UniversalPrinterDriver() }
};