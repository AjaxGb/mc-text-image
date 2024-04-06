const imageInput = document.getElementById('image-input');
const widthIn = document.getElementById('width');
const heightIn = document.getElementById('height');
const keepRatio = document.getElementById('keep-ratio');
const pixelShape = document.getElementById('pixel-shape');
const smoothing = document.getElementById('smoothing');
const transpCutoff = document.getElementById('transparency-cutoff');
const stripSpace = document.getElementById('strip-space');
const outputType = document.getElementById('output-type');

const jsonOut = document.getElementById('json-out');
const sizeOut = document.getElementById('size-out');
const canvas = document.getElementById('canvas');
const canvasOutline = document.getElementById('canvas-outline');

const flagsEl = document.body;

const ctx = canvas.getContext('2d');

const imageLoader = new Image();

function loadImage(imageFile) {
	const prevSrc = imageLoader.src;
    flagsEl.classList.remove('image-loaded');
    imageLoader.src = URL.createObjectURL(imageFile);
	if (prevSrc) {
    	URL.revokeObjectURL(prevSrc);
    }
}

imageLoader.addEventListener('error', e => {
    flagsEl.classList.remove('image-loaded');
	console.error('Failed to load image:', e);
    alert('Failed to load image!');
});
imageLoader.addEventListener('load', e => {
    flagsEl.classList.add('image-loaded');
    updateOutput();
});

for (const el of [
    widthIn, heightIn, pixelShape, smoothing,
    transpCutoff, stripSpace, outputType,
]) {
    el.addEventListener('change', updateOutput);
}

keepRatio.addEventListener('change', () => {
    if (!keepRatio.checked && flagsEl.classList.contains('image-loaded')) {
        // Changed to absolute sizing while image was loaded
        const size = calcSize(true);
        widthIn.value = size.w;
        heightIn.value = size.unscaledH;
    }
    updateOutput();
});

{
    const prevInputEventSize = {
        width: parseSize(widthIn.value),
        height: parseSize(heightIn.value),
    };

    function onSizeInput(type, input) {
        const prevValue = prevInputEventSize[type];
        const currValue = parseSize(input.value);
        
        prevInputEventSize[type] = currValue;
        
        if (Math.abs(currValue - prevValue) === 1) {
            // Probably caused by arrow buttons
            updateOutput();
        }
    }
    
    widthIn.addEventListener('input', () => onSizeInput('width', widthIn));
    heightIn.addEventListener('input', () => onSizeInput('height', heightIn));
}

let doFullSelect = false;
jsonOut.addEventListener('mousedown', e => {
	doFullSelect = e.button === 0 && !e.altKey && document.activeElement !== jsonOut;
});
jsonOut.addEventListener('click', e => {
	if (e.button === 0 && !e.altKey && doFullSelect) {
    	jsonOut.focus();
        jsonOut.select();
    }
});

// Chosen to have the same width in Minecraft text.
// Minecraft's font has very stupid character widths,
// so it probably won't look good in other fonts.
const BLOCK_CHAR = '\u2587';
const SPACE_CHAR = '\u2007';
const TRAILING_SPACE = new RegExp(SPACE_CHAR + '+$');

const FONT_RATIO = 1.8;

function parseSize(text) {
	const parsed = parseInt(text);
    return (parsed > 0) ? parsed : 0;
}

function calcSize(keepRatio) {
    const origW = imageLoader.naturalWidth;
    const origH = imageLoader.naturalHeight;
    const parsedW = parseSize(widthIn.value);
    const parsedH = parseSize(heightIn.value);
    
    let w = parsedW || origW;
    let h = parsedH || origH;
    if (keepRatio) {
        const originRatio = origW / origH;
        const currRatio = w / h;
        
        if ((currRatio > originRatio) || (origH && !origW)) {
            // Too wide, or only height was specified
            // Update width from height
            w = h * origW / origH;
        } else {
            // Update height from width
            h = w * origH / origW;
        }
    }
    
    const pixelRatio = (pixelShape.value === 'font') ? 1.8 : 1.0;
    
    return {
        w: Math.round(w),
        h: Math.round(h / pixelRatio),
        unscaledH: Math.round(h),
        origW, origH,
        controlW: parsedW || w,
        controlH: Math.round((parsedH || h) / pixelRatio),
    };
}

function hexNibble(value) {
	return value.toString(16).padStart(2, '0');
}

function makeHexColor(pixels, offset, cutoff) {
    const a = pixels[offset + 3];
    if (a < cutoff) {
    	// Make fully transparent
    	pixels[offset + 3] = 0;
        return null;
    } else {
    	// Make fully opaque
        pixels[offset + 3] = 255;
        const r = pixels[offset + 0];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        return '#' + hexNibble(r) + hexNibble(g) + hexNibble(b);
    }
}

const SCALED_TRANSFORM = 'transformation:{'
    + 'scale:[1f,0.5555555f,1f],'
    + 'left_rotation:[0f,0f,0f,1f],'
    + 'right_rotation:[0f,0f,0f,1f],'
    + 'translation:[0f,0f,0f]'
    + '},';

function jsonToText(json) {
    let output = JSON.stringify(json);
    
    if (outputType.value === 'json') {
        return output;
    }
    
    // Convert to SNBT
    output = "'" + output.replace(/\\/g, '\\\\') + "'";
    
    if (outputType === 'snbt') {
        return output;
    }
    
    const align = stripSpace.checked ? '"left"' : '"center"';
    const trans = (pixelShape.value === 'font') ? '' : SCALED_TRANSFORM;
    // There doesn't seem to be a limit for "line_width", so just use the maximum NBT integer
    return `summon text_display ~ ~ ~ {alignment:${align},${trans}line_width:2147483647,text:${output}}`;
}

const prevSafeInputs = {
    src: null,
    w: '60',
    h: '100',
    keepRatio: keepRatio.checked,
    pixelShape: pixelShape.value,
};
let allowGiantImage = false;

function updateOutput() {
	if (!flagsEl.classList.contains('image-loaded')) {
    	return;
    }
    
    const {w, h, origW, origH, controlW, controlH} = calcSize(keepRatio.checked);
    
    canvas.width = w;
    canvas.height = h;
    if (w === origW && h === origH) {
        sizeOut.innerText = `${w}×${h}`;
    } else {
        sizeOut.innerText = `${w}×${h} (original ${origW}×${origH})`;
    }
    canvasOutline.style.width = controlW + 'px';
    canvasOutline.style.height = controlH + 'px';
    
    if (!allowGiantImage && w * h > 100000) {
    	const resp = confirm(`You are trying to generate a very large image (${w} x ${h} = ${w * h} pixels), are you sure?`);
        if (!resp) {
            if (prevSafeInputs.src !== imageLoader.src) {
                // Bigness caused by new image
                widthIn.value = 60;
                heightIn.value = 100;
            } else {
                // Bigness caused by change to inputs
                widthIn.value = prevSafeInputs.w;
                heightIn.value = prevSafeInputs.h;
                keepRatio.checked = prevSafeInputs.keepRatio;
                pixelShape.value = prevSafeInputs.pixelShape;
            }
            updateOutput();
            return;
        } else {
        	allowGiantImage = true;
        }
    }
    if (!allowGiantImage) {
        prevSafeInputs.src = imageLoader.src;
        prevSafeInputs.w = widthIn.value;
        prevSafeInputs.h = heightIn.value;
        prevSafeInputs.keepRatio = keepRatio.checked;
        prevSafeInputs.pixelShape = pixelShape.value;
    }
    
    if (smoothing.value) {
    	ctx.imageSmoothingEnabled = true;
    	ctx.imageSmoothingQuality = smoothing.value;
    } else {
    	ctx.imageSmoothingEnabled = false;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(imageLoader, 0, 0, w, h);
    
    const cutoff = parseInt(transpCutoff.value) || 0;
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const json = [];
    let currColor = null;
    let currText = '';
    for (let x = 0, i = 0; i < pixels.length; x++, i += 4) {
    	if (x >= w) {
        	if (stripSpace.checked) {
        		currText = currText.replace(TRAILING_SPACE, '');
            }
            currText += '\n';
        	x = 0;
        }
        const newColor = makeHexColor(pixels, i, cutoff);
        if (currColor && newColor && currColor != newColor) {
        	json.push({text: currText, color: currColor});
            currText = '';
        }
        if (newColor) {
        	currColor = newColor;
            currText += BLOCK_CHAR;
        } else {
        	currText += SPACE_CHAR;
        }
    }
    if (stripSpace.checked) {
        currText = currText.replace(TRAILING_SPACE, '');
    }
    if (currText && currColor) {
    	json.push({text: currText, color: currColor});
    }
    
    // Apply transparency cutoff to preview
    ctx.putImageData(imageData, 0, 0);
    
    jsonOut.value = jsonToText(json);
}

function findImageTransfer(data) {
	for (const item of data.items) {
    	if (item.kind === 'file' && item.type.startsWith('image/')) {
        	return item.getAsFile();
        }
    }
    return null;
}

imageInput.addEventListener('change', e => {
	loadImage(imageInput.files[0]);
});

window.addEventListener('paste', e => {
	const image = findImageTransfer(e.clipboardData);
    if (image) {
    	e.preventDefault();
        imageInput.value = '';
        loadImage(image);
    }
});

window.addEventListener('dragover', e => {
	const image = findImageTransfer(e.dataTransfer);
    if (image) {
    	e.preventDefault();
    }
});

window.addEventListener('drop', e => {
	const image = findImageTransfer(e.dataTransfer);
    if (image) {
    	e.preventDefault();
        imageInput.value = '';
        loadImage(image);
    }
});