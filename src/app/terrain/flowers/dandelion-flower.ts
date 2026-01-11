import { Flower } from './flower';

const MODEL_PATH = '/src/assets/models/dandelion_flower/';
const MTL_FILE = '12971_Dandelion_Flower_v1_l2.mtl';
const OBJ_FILE = '12971_Dandelion_Flower_v1_l2.obj';
const MODEL_SCALE = 1;

export class DandelionFlower extends Flower {
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
