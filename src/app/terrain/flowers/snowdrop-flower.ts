import { Flower } from './flower';

const MODEL_PATH = '/src/assets/models/snowdrop_flower/';
const MTL_FILE = '12970_snowdrop_flower_v1_l2.mtl';
const OBJ_FILE = '12970_snowdrop_flower_v1_l2.obj';
const MODEL_SCALE = 0.5;

export class SnowdropFlower extends Flower {
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
