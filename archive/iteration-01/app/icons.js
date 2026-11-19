// Stoneware glyphs adapted directly from the supplied Kiln Jazz archive player.
const escape = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function h(tag, props, ...children) {
  const attrs = Object.entries(props || {}).filter(([k])=> k !== 'style').map(([k,v]) => `${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}="${escape(v)}"`).join(' ');
  return `<${tag} ${attrs}>${children.flat().join('')}</${tag}>`;
}
function StonewareRailIcon({ icon, color }) {
  const line = {
    fill:'none',
    stroke:color,
    strokeWidth:1.55,
    strokeLinecap:'round',
    strokeLinejoin:'round',
  };
  const softFill = color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgba($1,$2,$3,.10)');
  const svgStyle = { display:'block', overflow:'visible' };
  const props = { width:16, height:16, viewBox:'0 0 20 20', 'aria-hidden':true, focusable:false, style:svgStyle };

  if (icon === 'kiln') {
    return h('svg',props,
      h('path',{...line,d:'M4.5 16V9.8C4.5 5.9 6.9 3.5 10 3.5s5.5 2.4 5.5 6.3V16'}),
      h('path',{...line,d:'M7.2 16v-5.3c0-2.1 1.1-3.4 2.8-3.4s2.8 1.3 2.8 3.4V16'}),
      h('path',{...line,d:'M3.5 16.2h13'})
    );
  }
  if (icon === 'vessel') {
    return h('svg',props,
      h('path',{...line,d:'M6.2 5.2h7.6'}),
      h('path',{...line,d:'M7.2 5.5c-.4 2.5-1.6 3.5-1.6 6.3 0 3 2 4.7 4.4 4.7s4.4-1.7 4.4-4.7c0-2.8-1.2-3.8-1.6-6.3'}),
      h('path',{...line,d:'M7 11.8c1.9.8 4.1.8 6 0'})
    );
  }
  if (icon === 'glaze') {
    return h('svg',props,
      h('path',{...line,d:'M10 3.5s4.1 4.4 4.1 8.1a4.1 4.1 0 0 1-8.2 0C5.9 7.9 10 3.5 10 3.5z'}),
      h('path',{...line,d:'M8.1 12.4c.4 1 1.1 1.5 2.2 1.5'})
    );
  }
  if (icon === 'flame') {
    return h('svg',props,
      h('path',{...line,d:'M10.6 17c-2.6 0-4.6-1.8-4.6-4.5 0-2.2 1.2-3.5 2.8-5.1.8-.9 1-2 .7-3.2 2.9 1.6 4.8 3.8 4.8 6.6 0 1.1-.4 2-1.1 2.8'}),
      h('path',{...line,d:'M10.5 16.8c1.2-.7 1.8-1.6 1.8-2.8 0-1.3-.8-2.3-2-3.2.1 1-.2 1.6-.8 2.2-.6.6-1 1.2-1 2 0 1.1.8 1.8 2 1.8z'})
    );
  }
  if (icon === 'brush') {
    return h('svg',props,
      h('path',{...line,d:'M12.7 3.8l3.5 3.5-6.8 6.8-3.5-3.5 6.8-6.8z'}),
      h('path',{...line,d:'M5.8 10.8c-1.5 1-2.1 2.6-2 4.9 2.4.2 4-.5 5-2'}),
      h('path',{...line,d:'M11.6 4.9l3.5 3.5'})
    );
  }
  if (icon === 'wheel') {
    return h('svg',props,
      h('circle',{...line,cx:10,cy:10,r:5.8}),
      h('circle',{...line,cx:10,cy:10,r:1.8}),
      h('path',{...line,d:'M10 4.2v3.9M10 11.9v3.9M4.2 10h3.9M11.9 10h3.9M5.9 5.9l2.8 2.8M11.3 11.3l2.8 2.8M14.1 5.9l-2.8 2.8M8.7 11.3l-2.8 2.8'})
    );
  }
  if (icon === 'clay') {
    return h('svg',props,
      h('path',{...line,d:'M4 13.8c2.8 1.2 9.2 1.2 12 0'}),
      h('path',{...line,d:'M5.2 10.2c2.4 1 7.2 1 9.6 0'}),
      h('path',{...line,d:'M6.6 6.8c1.7.7 5.1.7 6.8 0'}),
      h('path',{...line,d:'M4 13.8l1.2-3.6 1.4-3.4M16 13.8l-1.2-3.6-1.4-3.4'})
    );
  }
  if (icon === 'leaf') {
    return h('svg',props,
      h('path',{...line,d:'M16.4 4.1C10.2 4.4 5.5 7.7 5.5 12.4c0 2 1.3 3.4 3.3 3.4 4.6 0 7.4-5.1 7.6-11.7z'}),
      h('path',{...line,d:'M5.6 15.1c2.6-3.5 5.5-5.6 9.1-7.1'})
    );
  }
  if (icon === 'mobile') {
    return h('svg',props,
      h('rect',{...line,x:6.2,y:2.8,width:7.6,height:14.4,rx:1.7}),
      h('path',{...line,d:'M8.6 5h2.8'}),
      h('path',{...line,d:'M9.2 15.1h1.6'})
    );
  }
  if (icon === 'monitor') {
    return h('svg',props,
      h('rect',{...line,x:3.4,y:4.3,width:13.2,height:8.9,rx:1.1}),
      h('path',{...line,d:'M8.1 16.1h3.8'}),
      h('path',{...line,d:'M10 13.2v2.9'})
    );
  }
  if (icon === 'paper') {
    return h('svg',props,
      h('path',{...line,d:'M5.3 3.2h6.5l3.2 3.2v10.4H5.3z'}),
      h('path',{...line,d:'M11.8 3.2v3.2H15'}),
      h('path',{...line,d:'M7.6 9.6h4.8M7.6 12.2h4.8M7.6 14.8h3'})
    );
  }
  if (icon === 'sparrow') {
    return h('svg',props,
      h('path',{...line,d:'M3.7 10.7c2.9-3.1 5.4-4.3 8.6-3.4 1.8.5 2.9 1.7 4 3.5'}),
      h('path',{...line,d:'M8.1 8.1c.8-2.4 2.3-4 4.7-5.1-.2 2.7-1.3 4.8-3.3 6.3'}),
      h('path',{...line,d:'M8.5 10.7c1.1 2.1 2.7 3.6 5 4.7-.4-2.5-1.5-4.4-3.5-5.6'}),
      h('path',{...line,d:'M3.7 10.7c1.2.2 2.2.2 3.2 0'})
    );
  }
  if (icon === 'stone') {
    return h('svg',props,
      h('path',{...line,fill:softFill,d:'M4.3 10.2l3.1-4.8 5.4-1.1 3.4 4.2-1.5 5.7-5.1 2.4-4.7-1.7-1.4-3.1z'}),
      h('path',{...line,d:'M7.4 5.4l2.2 4.1 6.6-1M9.6 9.5l-.1 7.1M9.6 9.5l-5.3.7'})
    );
  }
  return h('svg',props,
    h('path',{...line,d:'M10 3.8v3.5M10 12.7v3.5M3.8 10h3.5M12.7 10h3.5'}),
    h('path',{...line,d:'M5.7 5.7l2.5 2.5M11.8 11.8l2.5 2.5M14.3 5.7l-2.5 2.5M8.2 11.8l-2.5 2.5'})
  );
}


export function icon(name) {
 const paths = {
  search:'<circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4"/>',
  close:'<path d="m5 5 10 10M15 5 5 15"/>',
  chevron:'<path d="m6 8 4 4 4-4"/>',
  moon:'<path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z"/>',
  grid:'<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/>',
  pin:'<path d="M15.5 8c0 4-5.5 9-5.5 9S4.5 12 4.5 8a5.5 5.5 0 0 1 11 0Z"/><circle cx="10" cy="8" r="1.8"/>',
  play:'<path d="m7 4 9 6-9 6Z"/>',
  live:'<circle cx="10" cy="10" r="7" stroke-dasharray="1 2"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r="1"/>',
  arrow:'<path d="M4 10h12M11 5l5 5-5 5"/>',
  download:'<path d="M10 3v9m-4-4 4 4 4-4M4 14v3h12v-3"/>',
  check:'<path d="m4 10 4 4 8-8"/>',
  clock:'<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/>',
  camera:'<path d="M3 6h3l1-2h6l1 2h3v10H3Z"/><circle cx="10" cy="10.5" r="3"/>',
 };
 if(paths[name]) return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
 return StonewareRailIcon({icon:name,color:'currentColor'});
}
