import { Flower } from './flower';

const MODEL_PATH = '/src/assets/models/daisy/';
const MTL_FILE = '10441_Daisy_v1_max2010_iteration-2.mtl';
const OBJ_FILE = '10441_Daisy_v1_max2010_iteration-2.obj';
const MODEL_SCALE = 0.2;

export class Daisy extends Flower {
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
