import { Flower } from './flower';

const MODEL_PATH = '/src/assets/models/crocus_flower/';
const MTL_FILE = '12974_crocus_flower_v1_l3.mtl';
const OBJ_FILE = '12974_crocus_flower_v1_l3.obj';
const MODEL_SCALE = 0.1;

export class CrocusFlower extends Flower {
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
