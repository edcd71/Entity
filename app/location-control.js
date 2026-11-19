import {mountFloatingRail} from './floating-rail.js';

export function matchesLocation(photo, selection) {
  return !selection || (photo.location?.id || 'unknown') === selection;
}

export function mountLocationControl(rail, photos, onFilter) {
  const search = rail.querySelector('.location-search');
  const list = rail.querySelector('.location-options');
  const empty = rail.querySelector('.location-empty');
  const places = new Map();
  for (const photo of photos) {
    if (photo.location) places.set(photo.location.id, photo.location);
  }
  const choices = [
    {id: 'all', label: 'All locations'},
    ...[...places.values()].sort((a, b) => a.label.localeCompare(b.label) || a.region.localeCompare(b.region)),
    {id: 'unknown', label: 'No location'},
  ];
  const options = choices.map(place => {
    const label = document.createElement('label');
    label.className = 'location-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'capture-location';
    input.value = place.id;
    input.checked = place.id === 'all';
    const text = document.createElement('span');
    text.className = 'location-name';
    const name = document.createElement('span');
    name.textContent = place.label;
    text.append(name);
    const region = [place.region, place.country].filter(Boolean).join(' · ');
    if (region) {
      const sub = document.createElement('small');
      sub.textContent = region;
      text.append(sub);
    }
    const count = document.createElement('span');
    count.className = 'location-count';
    count.setAttribute('aria-hidden', 'true');
    label.append(input, text, count);
    list.append(label);
    return {place, label, input, count, terms: (place.label + ' ' + region).toLocaleLowerCase()};
  });

  function update(firstYear, lastYear, includePhoto = () => true, rangeLabel = 'selected date range') {
    const counts = new Map();
    let total = 0;
    for (const photo of photos) {
      if (photo.year < firstYear || photo.year > lastYear || !includePhoto(photo)) continue;
      const key = photo.location?.id || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
      total++;
    }
    for (const option of options) {
      const count = option.place.id === 'all' ? total : counts.get(option.place.id) || 0;
      option.count.textContent = count.toLocaleString();
      option.input.setAttribute('aria-label', option.place.label + (option.place.region ? ', ' + option.place.region : ''));
      option.input.setAttribute('aria-description', count.toLocaleString() + (count === 1 ? ' image' : ' images') + ' in the ' + rangeLabel);
    }
  }
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    let matches = 0;
    for (const option of options) {
      const visible = option.place.id === 'all' || option.terms.includes(query);
      option.label.hidden = !visible;
      if (visible && option.place.id !== 'all') matches++;
    }
    empty.hidden = matches > 0;
    list.scrollTop = 0;
  });
  list.addEventListener('change', event => {
    const option = options.find(option => option.input === event.target);
    if (!option) return;
    const selection = option.place.id === 'all' ? null : option.place.id;
    rail.toggleAttribute('data-filtered', Boolean(selection));
    rail.setAttribute('aria-description', option.place.label);
    onFilter(selection, option.place.label);
  });
  update(-Infinity, Infinity);
  mountFloatingRail(rail, 'location filter');
  return {update};
}
