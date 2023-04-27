//    This file contains the source code of TinySDF, Copyright (c) 2016-2022 Mapbox, Inc.
//    https://github.com/mapbox/tiny-sdf/blob/main/LICENSE.txt


const INF = 1e20;
class TinySDF {
    constructor({
        fontSize = 24,
        buffer = 3,
        radius = 8,
        cutoff = 0.25,
        fontFamily = 'sans-serif',
        fontWeight = 'normal',
        fontStyle = 'normal',
        text = '',
        canvas = null
    } = {}) {
        this.buffer = buffer;
        this.cutoff = cutoff;
        this.radius = radius;
        this.text = text;

        // make the canvas size big enough to both have the specified buffer around the glyph
        // for "halo", and account for some glyphs possibly being larger than their font size
        const size = this.size = text.length * fontSize + buffer * 4;

        canvas.width = canvas.height = size;
        //var canvas = new OffscreenCanvas(size, size);

        // const canvas = this._createCanvas(size);
        const ctx = this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left'; // Necessary so that RTL text doesn't have different alignment
        ctx.fillStyle = 'black';

        // temporary arrays for the distance transform
        this.gridOuter = new Float64Array(size * size);
        this.gridInner = new Float64Array(size * size);
        this.f = new Float64Array(size);
        this.z = new Float64Array(size + 1);
        this.v = new Uint16Array(size);
    }

    draw() {
        var char = this.text;

        const { ctx, buffer, gridInner, gridOuter } = this;

        const {
            width: glyphAdvance,
            actualBoundingBoxAscent,
            actualBoundingBoxDescent,
            actualBoundingBoxLeft,
            actualBoundingBoxRight
        } = this.ctx.measureText(char);

        var parts = char.split('\n');
        if (parts.length === 2 && parts[1] === parts[0]) {
            // parts = [parts[0]];
            parts = [""];
        }

        if (parts.length === 2) {
            parts[1] = parts[1].replace(parts[0], '').trim();
            parts = [parts[1]];
        }

        var maxWidth = 0;
        var maxHeight = 0;

        for (var part of parts) {
            var measure = ctx.measureText(part);
            var actualHeight = measure.actualBoundingBoxAscent + measure.actualBoundingBoxDescent;
            if (measure.width > maxWidth) maxWidth = measure.width;
            if (actualHeight > maxHeight) maxHeight = actualHeight;
        }

        maxWidth = Math.ceil(maxWidth);
        maxHeight = Math.ceil(maxHeight);

        // The integer/pixel part of the top alignment is encoded in metrics.glyphTop
        // The remainder is implicitly encoded in the rasterization
        const glyphTop = Math.ceil(actualBoundingBoxAscent);
        const glyphLeft = 0;

        // If the glyph overflows the canvas size, it will be clipped at the bottom/right
        const glyphWidth = Math.max(0, Math.min(this.size - this.buffer, Math.ceil(actualBoundingBoxRight - actualBoundingBoxLeft)));
        const lineSpacing = 10;
        const glyphHeight = parts.length * (maxHeight + lineSpacing); // Math.min(this.size - this.buffer, glyphTop + Math.ceil(actualBoundingBoxDescent)) + 60;

        const width = glyphWidth + 2 * this.buffer;
        const height = glyphHeight + 2 * this.buffer;

        const len = Math.max(width * height, 0);
        const data = new Uint8ClampedArray(len);
        const glyph = { data, width, height, glyphWidth, glyphHeight, glyphTop, glyphLeft, glyphAdvance };
        if (glyphWidth === 0 || glyphHeight === 0) return glyph;

        //ctx.clearRect(buffer, buffer, ctx, glyphHeight);

        ctx.clearRect(buffer, buffer, ctx, maxHeight);

        //console.log('maxHeight', maxHeight)
        for (var i =0; i< parts.length; ++i) {
            ctx.fillText(parts[i], buffer, buffer + glyphTop + (maxHeight + lineSpacing) * i);
        }
        

        const imgData = ctx.getImageData(buffer, buffer, glyphWidth, glyphHeight);

        // Initialize grids outside the glyph range to alpha 0
        gridOuter.fill(INF, 0, len);
        gridInner.fill(0, 0, len);

        for (let y = 0; y < glyphHeight; y++) {
            for (let x = 0; x < glyphWidth; x++) {
                const a = imgData.data[4 * (y * glyphWidth + x) + 3] / 255; // alpha value
                if (a === 0) continue; // empty pixels

                const j = (y + buffer) * width + x + buffer;

                if (a === 1) { // fully drawn pixels
                    gridOuter[j] = 0;
                    gridInner[j] = INF;

                } else { // aliased pixels
                    const d = 0.5 - a;
                    gridOuter[j] = d > 0 ? d * d : 0;
                    gridInner[j] = d < 0 ? d * d : 0;
                }
            }
        }

        edt(gridOuter, 0, 0, width, height, width, this.f, this.v, this.z);
        edt(gridInner, buffer, buffer, glyphWidth, glyphHeight, width, this.f, this.v, this.z);

        for (let i = 0; i < len; i++) {
            const d = Math.sqrt(gridOuter[i]) - Math.sqrt(gridInner[i]);
            data[i] = Math.round(255 - 255 * (d / this.radius + this.cutoff));
        }

        return glyph;
    }
}

// 2D Euclidean squared distance transform by Felzenszwalb & Huttenlocher https://cs.brown.edu/~pff/papers/dt-final.pdf
function edt(data, x0, y0, width, height, gridSize, f, v, z) {
    for (let x = x0; x < x0 + width; x++) edt1d(data, y0 * gridSize + x, gridSize, height, f, v, z);
    for (let y = y0; y < y0 + height; y++) edt1d(data, y * gridSize + x0, 1, width, f, v, z);
}

// 1D squared distance transform
function edt1d(grid, offset, stride, length, f, v, z) {
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    f[0] = grid[offset];

    for (let q = 1, k = 0, s = 0; q < length; q++) {
        f[q] = grid[offset + q * stride];
        const q2 = q * q;
        do {
            const r = v[k];
            s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
        } while (s <= z[k] && --k > -1);

        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
    }

    for (let q = 0, k = 0; q < length; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        const qr = q - r;
        grid[offset + q * stride] = f[r] + qr * qr;
    }
}

// var canvas = null;

var canvas = new OffscreenCanvas(200, 200);

self.onmessage = function (e) {
    if (e.data.canvas !== undefined) {
        canvas = e.data.canvas;
    }
    else {
        const tinySdf = new TinySDF({
            fontSize: 34,             // Font size in pixels
            fontFamily: 'sans-serif', // CSS font-family
            fontWeight: 'normal',     // CSS font-weight
            fontStyle: 'normal',      // CSS font-style
            buffer: 5,                // Whitespace buffer around a glyph in pixels
            radius: 8,                // How many pixels around the glyph shape to use for encoding distance
            cutoff: 0.25,              // How much of the radius (relative) is used for the inside part of the glyph
            text: e.data.text,
            canvas: canvas
        });
        const glyph = tinySdf.draw();
        var data = new Uint8Array(glyph.width * glyph.height * 4);
        for (var i = 0; i < glyph.width * glyph.height; ++i) {
            data[4 * i + 0] = 0;
            data[4 * i + 1] = 0;
            data[4 * i + 2] = 0;
            data[4 * i + 3] = glyph.data[i];
        }
        
        postMessage({
            data,
            width: glyph.width,
            height: glyph.height,
            text: e.data.text
        });
    }
};
