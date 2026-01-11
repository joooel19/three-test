import { Flower } from './flower';

const MODEL_PATH = '/src/assets/models/rock/';
const MTL_FILE = 'Rock1.mtl';
const OBJ_FILE = 'Rock1.obj';
const MODEL_SCALE = 1;

export class Rock extends Flower {
  constructor(scale: number) {
    super();
    this.loadAndAttachOBJModel({
      basePath: MODEL_PATH,
      externalScale: scale,
      modelScale: MODEL_SCALE,
      mtlFile: MTL_FILE,
      objectFile: OBJ_FILE,
    }).catch(console.error);
  }
}
