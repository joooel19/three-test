export const grassVertexSource = `
precision lowp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec3 offset;
attribute vec2 uv;
attribute vec2 halfRootAngle;
attribute float scale;
attribute float index;
uniform float time;

uniform float width;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;
uniform float ambientStrength;
uniform float diffuseStrength;
uniform float specularStrength;
uniform float translucencyStrength;
uniform float shininess;
uniform vec3 lightColour;
uniform vec3 sunDirection;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying float frc;
varying float idx;
varying vec3 vLightMul;
varying vec3 vSpecular;

const float PI = 3.1415;
const float TWO_PI = 2.0 * PI;

vec3 rotateVectorByQuaternion(vec3 v, vec4 q){
  return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
}

void main() {

  frc = position.y / float(1.0);
  vec3 localPos = position;
  localPos.y *= scale;
  vec3 localNormal = normal;
  localNormal.y /= scale;

  vec4 direction = vec4(0.0, halfRootAngle.x, 0.0, halfRootAngle.y);
  localPos = rotateVectorByQuaternion(localPos, direction);
  localNormal = rotateVectorByQuaternion(localNormal, direction);
  vUv = uv;

  // Place blade at instance offset (offset is local XYXZ relative to chunk center)
  vec3 pos;
  pos.x = offset.x;
  pos.z = offset.z;
  pos.y = offset.y;

  vec2 fractionalPos = 0.5 + offset.xz / width;
  fractionalPos *= TWO_PI;
  float noise = 0.5 + 0.5 * sin(fractionalPos.x + time);
  float halfAngle = -noise * 0.1;
  noise = 0.5 + 0.5 * cos(fractionalPos.y + time);
  halfAngle -= noise * 0.05;
  direction = normalize(vec4(sin(halfAngle), 0.0, -sin(halfAngle), cos(halfAngle)));
  localPos = rotateVectorByQuaternion(localPos, direction);
  localNormal = rotateVectorByQuaternion(localNormal, direction);
  localPos += pos;
  idx = index;

  // compute world-space position & normal for lighting
  vec4 worldPos4 = modelMatrix * vec4(localPos, 1.0);
  vec3 worldPos = worldPos4.xyz;
  vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);

  // lighting calculations (Gouraud shading per-vertex)
  vec3 lightDir = normalize(sunDirection);
  float dotNormalLight = dot(worldNormal, lightDir);
  float diff = max(dotNormalLight, 0.0);

  vec3 diffuse = diff * lightColour * diffuseStrength;
  float sky = max(dot(worldNormal, vec3(0,1,0)), 0.0);
  vec3 skyLight = sky * vec3(0.12, 0.29, 0.55);

  vec3 viewDirection = normalize(cameraPosition - worldPos);
  vec3 halfwayDir = normalize(lightDir + viewDirection);
  float spec = pow(max(dot(worldNormal, halfwayDir), 0.0), shininess);
  vec3 specular = spec * vec3(specularStrength) * (lightColour * vec3(1.0));

  vec3 diffuseTranslucency = vec3(0.0);
  vec3 forwardTranslucency = vec3(0.0);
  float dotViewLight = dot(-lightDir, viewDirection);
  float back = step(dotNormalLight, 0.0);
  diffuseTranslucency = lightColour * translucencyStrength * back * -dotNormalLight;
  if(dotViewLight > 0.0) forwardTranslucency = lightColour * translucencyStrength * pow(dotViewLight, 16.0);

  // Compose a multiplicative lighting term to be applied to the texture colour in the fragment
  vLightMul = 0.3 * skyLight + vec3(ambientStrength) + diffuse + diffuseTranslucency + forwardTranslucency;
  vSpecular = specular;

  // assign varyings used in fragment
  vNormal = localNormal;
  vPosition = worldPos;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(localPos, 1.0);
}
`;

export const grassFragmentSource = `
precision lowp float;
uniform vec3 cameraPosition;
uniform sampler2D map;
uniform sampler2D alphaMap;
varying float frc;
varying float idx;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vLightMul;
varying vec3 vSpecular;
void main(){
  float alpha = texture2D(alphaMap, vUv).r;
  vec3 normal;
  if(gl_FrontFacing) normal = normalize(vNormal); else normal = normalize(-vNormal);
  vec3 textureColour = texture2D(map, vUv).rgb;
  vec3 mixColour = idx > 0.75 ? vec3(0.35,0.55,0.20) : vec3(0.45,0.60,0.25);
  textureColour = mix(0.1 * mixColour, textureColour, 0.6);

  // Apply interpolated lighting from vertex shader
  vec3 col = vLightMul * textureColour + vSpecular;

  col = mix(0.35*vec3(0.1,0.25,0.02), col, frc);
  gl_FragColor = vec4(col, alpha);
}
`;
