import { parseSceneryPack } from './sceneryPackParser.js';

self.onmessage = async event => {
  try { self.postMessage({ pack: await parseSceneryPack(event.data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
