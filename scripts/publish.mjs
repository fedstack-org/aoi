/* eslint-disable no-undef */
import 'zx/globals'

const workspace = path.resolve(__dirname, '..')
cd(workspace)

let { stdout } = await $`yarn version apply --json --all`
const items = stdout
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line)
  .map((line) => JSON.parse(line))

let shouldCommit = false
for (const { ident } of items) {
  console.log(`Publishing ${chalk.greenBright(ident)}...`)
  await $`yarn workspace ${ident} npm publish --access public`
  await $`yarn workspace ${ident} pack --out package.tgz`
  shouldCommit = true
  if (process.env.CI) {
    const name = ident.split('/')[1]
    await $`echo "${name}_updated=true" >> "$GITHUB_OUTPUT"`
  }
}

if (shouldCommit) {
  if (process.env.CI) {
    await $`git config user.name aoi-js-bot`
    await $`git config user.email aoi@fedstack.org`
    await $`git add .`
    await $`git commit -m "chore: apply versions and publish"`
    await $`git push`
  } else {
    console.log(`Time to commit and push!`)
  }
}
