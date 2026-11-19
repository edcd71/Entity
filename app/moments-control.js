import {mountFloatingRail} from './floating-rail.js';

export function mountMomentsControl(rail, moments, onFilter) {
  const search = rail.querySelector('.moment-search');
  const list = rail.querySelector('.moment-list');
  const empty = rail.querySelector('.moment-empty');
  const all = rail.querySelector('.moment-all input');
  const allCount = rail.querySelector('.moment-all .moment-count');
  const hint = rail.querySelector('.moment-hint');
  let selected = null;
  const options = [...moments].reverse().map(moment => {
    const label = document.createElement('label');
    label.className = 'moment-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'capture-moment';
    input.value = moment.id;
    input.setAttribute('aria-label', moment.label);
    const image = document.createElement('img');
    image.className = 'moment-preview';
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    image.src = moment.photos[0].thumbnail;
    const text = document.createElement('span');
    text.className = 'moment-name';
    for (const [tag, value] of [['span', moment.place], ['small', moment.date], ['small', moment.time]]) {
      const line = document.createElement(tag);
      line.textContent = value;
      text.append(line);
    }
    const count = document.createElement('span');
    count.className = 'moment-count';
    count.setAttribute('aria-hidden', 'true');
    label.append(input, image, text, count);
    list.append(label);
    return {moment, label, input, count, matches: moment.photos.length, terms: moment.label.toLocaleLowerCase() + ' ' + (moment.photos[0].capturedAt || '')};
  });
  function showChoices() {
    const query = search.value.trim().toLocaleLowerCase();
    let available = 0, visible = 0;
    for (const option of options) {
      if (option.matches) available++;
      const show = (option.matches > 0 || option.moment.id === selected) && option.terms.includes(query);
      option.label.hidden = !show;
      if (show) visible++;
    }
    empty.hidden = visible > 0;
    empty.textContent = query ? 'No matching moments.' : 'No moments match these filters.';
    hint.textContent = available.toLocaleString() + (available === 1 ? ' moment' : ' moments') + ' · grouped by time & place';
  }
  function update(includePhoto) {
    let total = 0;
    for (const option of options) {
      option.matches = option.moment.photos.filter(includePhoto).length;
      total += option.matches;
      option.count.textContent = option.matches.toLocaleString();
      option.input.setAttribute('aria-description', option.matches + ' of ' + option.moment.photos.length + ' images match the current date, time, and location filters.');
    }
    allCount.textContent = total.toLocaleString();
    all.setAttribute('aria-description', total.toLocaleString() + ' images across all moments with the current filters.');
    showChoices();
  }
  search.addEventListener('input', () => {showChoices(); list.scrollTop = 0;});
  rail.querySelector('.moment-options').addEventListener('change', event => {
    if (!event.target.matches('input[name="capture-moment"]')) return;
    selected = event.target === all ? null : event.target.value;
    const option = options.find(option => option.moment.id === selected);
    rail.toggleAttribute('data-filtered', Boolean(selected));
    rail.setAttribute('aria-description', option?.moment.label || 'All moments');
    onFilter(selected, option?.moment.label || 'All moments');
  });
  update(() => true);
  mountFloatingRail(rail, 'moments');
  return {update};
}
