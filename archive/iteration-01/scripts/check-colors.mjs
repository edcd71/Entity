import assert from 'node:assert/strict';
import {normalizeHex,hexToLab,closestColor} from '../app/colors.js';
assert.equal(normalizeHex('abc'),'#AABBCC');assert.equal(normalizeHex('#a19b33'),'#A19B33');assert.equal(normalizeHex('not-a-color'),null);
const white=hexToLab('#FFFFFF'),black=hexToLab('#000000');assert(Math.abs(white[0]-100)<.001);assert(Math.abs(black[0])<.001);
assert(closestColor([{hex:'#FF0000',weight:.8},{hex:'#0000FF',weight:.2}],hexToLab('#FF0000')).delta<.001);
assert.equal(closestColor([{hex:'#FF0000',weight:.01},{hex:'#0000FF',weight:.99}],hexToLab('#FF0000')).hex,'#0000FF');
console.log('Color normalization and CIE Lab matching checks passed.');
