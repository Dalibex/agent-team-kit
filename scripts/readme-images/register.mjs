// Registers loader.mjs, so `node --import ./scripts/readme-images/register.mjs` can run the plugin's code.
import { register } from 'node:module'

register('./loader.mjs', import.meta.url)
