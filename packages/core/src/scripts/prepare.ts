import { promises as fs } from 'fs';
import hre from 'hardhat';
import type { BuildInfo } from 'hardhat/types';
import type { SourceUnit } from 'solidity-ast';
import { findAll } from 'solidity-ast/utils';
import _rimraf from 'rimraf';
import { promisify } from 'util';

const rimraf = promisify(_rimraf);

import type { OpenZeppelinContracts } from '../../openzeppelin-contracts';
import { writeGeneratedSources } from '../generate/sources';
import { mapValues } from '../utils/map-values';
import { transitiveClosure } from '../utils/transitive-closure';

async function main() {
  // await rimraf(hre.config.paths.sources);
  // await rimraf(hre.config.paths.artifacts);
  // await writeGeneratedSources(hre.config.paths.sources);
  // await hre.run('compile', { force: true });

  const buildInfoPaths = await hre.artifacts.getBuildInfoPaths();
  if (buildInfoPaths.length !== 1) {
    throw new Error('Wrong number of build-info files');
  }
  const buildInfo: BuildInfo = JSON.parse(
    await fs.readFile(buildInfoPaths[0]!, 'utf8'),
  );

  const dependencies: Record<string, Set<string>> = {};

  for (const [sourceFile, { ast }] of Object.entries(buildInfo.output.sources)) {
    if (sourceFile.startsWith('@openzeppelin/contracts')) {
      const sourceDependencies = (dependencies[sourceFile] ??= new Set());
      for (const imp of findAll('ImportDirective', ast)) {
        sourceDependencies.add(imp.absolutePath);
      }
    }
  }

  const sources: Record<string, string> = {};
  for (const [sourceFile, { content }] of Object.entries(buildInfo.input.sources)) {
    if (sourceFile.startsWith('@openzeppelin/contracts')) {
      sources[sourceFile] = content;
    }
  }

  const version: string = require('@openzeppelin/contracts/package.json').version;

  const contracts: OpenZeppelinContracts = {
    version,
    sources,
    dependencies: mapValues(transitiveClosure(dependencies), d => Array.from(d)),
  };

  await fs.writeFile('openzeppelin-contracts.json', JSON.stringify(contracts, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
