import fs from 'node:fs';

const screens = fs.readFileSync('js/screens.js', 'utf8');
const app = fs.readFileSync('js/app.js', 'utf8');
const domain = fs.readFileSync('js/domain.js', 'utf8');
const gasApi = fs.readFileSync('js/gas-api.js', 'utf8');
const server = fs.readFileSync('Code.gs', 'utf8');
const setup = fs.readFileSync('SetupSheetDB.gs', 'utf8');

if (!/function defaultWorkTypeGroup\(\)/.test(screens)) throw new Error('New request form needs an explicit default work-type group.');
if (!/productOptions\(defaultGroup\)/.test(screens)) throw new Error('The default work-type group must populate products immediately.');
if (!/data-role="collateral-mode"/.test(screens)) throw new Error('Collateral mode selector is missing from the new request row.');
if (!/TSBĐ có sẵn/.test(screens) || !/TSBĐ mới/.test(screens)) throw new Error('Collateral mode labels must distinguish existing and new collateral.');
if (!/collateral_mode/.test(screens)) throw new Error('New request payload must carry collateral_mode.');
if (!/collateral_mode/.test(gasApi)) throw new Error('GAS normalizer must preserve collateral_mode.');
if (!/collateral_mode/.test(setup)) throw new Error('WorkItems schema must persist collateral_mode.');
if (!/COLLATERAL_NEW_WORK_TYPE_/.test(server)) throw new Error('Server must define the collateral work type created for new collateral.');
if (!/collateral_mode/.test(server)) throw new Error('createRequest must validate and persist collateral_mode.');
if (!/parent_item_id/.test(server.slice(server.indexOf('function createRequest('), server.indexOf('/* ---------------------------- Chuyển trạng thái')))) {
  throw new Error('Creating new collateral must create a linked WorkItem.');
}
if (!/syncProductOptions\(firstGroup\)/.test(screens)) throw new Error('Dialog opening must initialize the dependent product selector.');

console.log('Request catalog contract passed: default Món products hydrate and collateral mode is explicit.');
