declare module "*.txt" {
  const content: string
  export default content
}

declare module "*.wasm" {
  const src: string
  export default src
}
