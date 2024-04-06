const imageInput = document.getElementById('image-input');
const widthIn = document.getElementById('width');
const heightIn = document.getElementById('height');
const ratioIn = document.getElementById('ratio');
const smoothing = document.getElementById('smoothing');
const transpCutoff = document.getElementById('transparency-cutoff');
const stripSpace = document.getElementById('strip-space');
const output = document.getElementById('output');

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

widthIn.addEventListener('input', updateOutput);
heightIn.addEventListener('input', updateOutput);
ratioIn.addEventListener('change', updateOutput);
smoothing.addEventListener('input', updateOutput);
transpCutoff.addEventListener('change', updateOutput);
output.addEventListener('change', updateOutput);

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
    return (parsed > 0) ? parsed : null;
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

let allowGiantImage = false;

function updateOutput() {
	if (!flagsEl.classList.contains('image-loaded')) {
    	return;
    }

    const realW = imageLoader.naturalWidth;
    const realH = imageLoader.naturalHeight;
	const parsedW = parseSize(widthIn.value);
	const parsedH = parseSize(heightIn.value);
	let w = parsedW || realW;
	let h = parsedH || realH;
    
    if (ratioIn.value) {
        const ratioAdjust = (ratioIn.value === 'font' ? FONT_RATIO : 1.0);
    	const idealRatio = realW / realH * ratioAdjust;
        const currRatio = w / h;
        
        
        if ((currRatio > idealRatio) || (realH && !realW)) {
        	// Too wide, or only height was specified
            // Update width from height
            w = Math.round(h / realH * ratioAdjust * realW);
        } else {
        	// Update height from width
            h = Math.round(w / realW / ratioAdjust * realH);
        }
    }
    
    canvas.width = w;
    canvas.height = h;
    canvasOutline.style.width = (parsedW || w) + 'px';
    canvasOutline.style.height = (parsedH || h) + 'px';
    if (w === realW && h === realH) {
    	sizeOut.innerText = `${w}×${h}`;
    } else {
    	sizeOut.innerText = `${w}×${h} (original ${realW}×${realH})`;
    }
    
    if (!allowGiantImage && w * h > 100000) {
    	const resp = confirm(`You are trying to generate a very large image (${w} x ${h} = ${w * h} pixels), are you sure?`);
        if (!resp) {
        	widthIn.value = 60;
            heightIn.value = 100;
            updateOutput();
            return;
        } else {
        	allowGiantImage = true;
        }
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
    
    let outputText = JSON.stringify(json);
    if (output.value === 'snbt') {
    	outputText = "'" + outputText.replace(/\\/g, '\\\\') + "'";
    } else if (output.value.startsWith('summon-')) {
        // alignment:"center" is the default value, however it's required in 1.20.4 to prevent the error "Display entityNot a string"
        // There doesn't seem to be a limit for "line_width", so just use the Java Integer maximum
    	outputText = 'summon text_display ~ ~ ~ {alignment:"center",line_width:2147483647,' +
            (output.value === 'summon-scaled' ? 'transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[0f,0f,0f],scale:[1f,0.555555f,1f]},' : '') +
            'text:\'' + outputText.replace(/\\/g, '\\\\') + '\'}';
    }
    jsonOut.value = outputText;
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