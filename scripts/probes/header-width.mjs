import assert from 'node:assert/strict';
const labels = {
  es: ['Detectando gestores', 'Sin novedades', 'Seleccionar', 'Confirmar', 'Actualizando', 'Resumen', 'Detalle por paquete', 'Ajustes'],
  en: ['Detecting managers', 'Up to date', 'Select', 'Confirm', 'Updating', 'Summary', 'Package details', 'Settings'],
};
let checked = 0;
let shortened = 0;
for (const [language, steps] of Object.entries(labels)) for (const label of steps) for (const newer of ['', ' -> 3.1.0']) {
  const brand = `tacuchi_ updater 3.0.1${newer}`;
  let header = `${brand}  ${language === 'es' ? 'Paso' : 'Step'} 4/4 · ${label}`;
  if (header.length > 58) { header = header.replace(' updater', ''); shortened++; }
  if (header.length > 58) header = header.replace(/(?:Paso|Step) /, '');
  if (header.length > 58) header = header.slice(0, 57) + '…';
  assert.ok(header.length <= 58);
  assert.ok(header.includes('tacuchi_') && header.includes('3.0.1') && header.includes('4/4'));
  if (newer) assert.ok(header.includes('3.1.0'));
  checked++;
}
console.log(JSON.stringify({ checked, shortened, usefulColumns: 58, verdict: 'shortening order fits' }));
