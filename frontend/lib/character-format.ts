import { ContentEntry, getContents, getTextFile, Repo } from './forgejo';

export interface PuruPuruProfile {
  settingsPath: string;
  frontalStates: number;
  directions: number;
  totalStates: number;
  motionPatchPath: string | null;
}

export interface CodexPetProfile {
  packageCount: number;
  firstPackageId: string;
  petJsonPath: string;
  spritesheetPath: string;
  previewPath: string | null;
  qaPath: string | null;
  atlasSize: string;
}

export interface CharacterSheetProfile {
  count: number;
  catalogPath: string;
  previewPath: string | null;
}

export interface CharacterRepositoryProfile {
  purupuru: PuruPuruProfile | null;
  codexPet: CodexPetProfile | null;
  characterSheets: CharacterSheetProfile | null;
  previewPath: string | null;
  secondaryPreviewPath: string | null;
  evidencePaths: string[];
}

function entries(data: ContentEntry[] | ContentEntry | null): ContentEntry[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

async function directory(owner: string, repo: string, path: string, ref: string) {
  const result = await getContents(owner, repo, path, ref);
  return result.ok ? entries(result.data) : [];
}

async function exists(owner: string, repo: string, path: string, ref: string) {
  const result = await getContents(owner, repo, path, ref);
  return result.ok && result.data !== null;
}

function firstImage(items: ContentEntry[]) {
  return items.find((item) => item.type === 'file' && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(item.name))?.path || null;
}

function expressionCount(items: ContentEntry[]) {
  return items.filter((item) => item.type === 'file' && /^eyes-(?:open|closed)-mouth-(?:closed|half|open)\.png$/i.test(item.name)).length;
}

export async function inspectCharacterRepository(repo: Repo): Promise<CharacterRepositoryProfile> {
  const owner = repo.owner?.login || repo.full_name.split('/')[0];
  const ref = repo.default_branch || 'main';

  const [avatar, directionRoots, hasSettings, hasMotionPatch, petRoots, sheetRoots, hasCharacterCatalog, thumbnailRoots] = await Promise.all([
    directory(owner, repo.name, 'avatar', ref),
    directory(owner, repo.name, 'avatar/directions', ref),
    exists(owner, repo.name, 'avatar/default-settings.json', ref),
    exists(owner, repo.name, 'integration/purupuru-lumi-jelly-head-motion.patch.gz', ref),
    directory(owner, repo.name, 'assets/pets', ref),
    directory(owner, repo.name, 'assets/exports', ref),
    exists(owner, repo.name, 'metadata/characters.csv', ref),
    directory(owner, repo.name, 'assets/thumbnails', ref),
  ]);

  const frontalStates = expressionCount(avatar);
  const directionDirs = directionRoots.filter((item) => item.type === 'dir');
  const directionEntries = await Promise.all(
    directionDirs.map((item) => directory(owner, repo.name, item.path, ref)),
  );
  const directionalStates = directionEntries.reduce((count, item) => count + expressionCount(item), 0);
  const purupuru = hasSettings && frontalStates > 0
    ? {
        settingsPath: 'avatar/default-settings.json',
        frontalStates,
        directions: 1 + directionDirs.length,
        totalStates: frontalStates + directionalStates,
        motionPatchPath: hasMotionPatch ? 'integration/purupuru-lumi-jelly-head-motion.patch.gz' : null,
      }
    : null;

  const petDirs = petRoots.filter((item) => item.type === 'dir');
  const rootPetPair = await Promise.all([
    exists(owner, repo.name, 'pet.json', ref),
    exists(owner, repo.name, 'spritesheet.webp', ref),
  ]);
  const nestedPetPairs = await Promise.all(petDirs.map(async (item) => {
    const [petJson, spritesheet] = await Promise.all([
      exists(owner, repo.name, `${item.path}/pet.json`, ref),
      exists(owner, repo.name, `${item.path}/spritesheet.webp`, ref),
    ]);
    return petJson && spritesheet ? item : null;
  }));
  const validNestedPets = nestedPetPairs.filter((item): item is ContentEntry => Boolean(item));
  // Maki is the canonical package called out by the catalog contract. Prefer
  // it when a collection contains several valid pets, while keeping generic
  // support for repositories that package other characters.
  const firstPet = validNestedPets.find((item) => item.name === 'maki') || validNestedPets[0] || null;
  const firstPackageId = firstPet?.name || (rootPetPair.every(Boolean) ? repo.name : '');
  let codexPet: CodexPetProfile | null = null;
  let petPreview: string | null = null;
  if (firstPackageId) {
    const petBase = firstPet?.path || '';
    const [previewEntries, hasQa, validationRaw] = await Promise.all([
      directory(owner, repo.name, petBase ? `${petBase}/preview` : 'preview', ref),
      exists(owner, repo.name, petBase ? `${petBase}/qa/contact-sheet.png` : 'qa/contact-sheet.png', ref),
      getTextFile(owner, repo.name, petBase ? `${petBase}/final/validation.json` : 'final/validation.json', ref),
    ]);
    petPreview = firstImage(previewEntries);
    let atlasSize = '1536×1872';
    if (validationRaw) {
      try {
        const validation = JSON.parse(validationRaw) as Record<string, unknown>;
        const width = Number(validation.width || (validation.atlas as Record<string, unknown> | undefined)?.width);
        const height = Number(validation.height || (validation.atlas as Record<string, unknown> | undefined)?.height);
        if (width > 0 && height > 0) atlasSize = `${width}×${height}`;
      } catch {
        // A paired package still satisfies the portable Codex Pet contract.
      }
    }
    codexPet = {
      packageCount: validNestedPets.length + (rootPetPair.every(Boolean) ? 1 : 0),
      firstPackageId,
      petJsonPath: petBase ? `${petBase}/pet.json` : 'pet.json',
      spritesheetPath: petBase ? `${petBase}/spritesheet.webp` : 'spritesheet.webp',
      previewPath: petPreview,
      qaPath: hasQa ? (petBase ? `${petBase}/qa/contact-sheet.png` : 'qa/contact-sheet.png') : null,
      atlasSize,
    };
  }

  const sheetDirs = sheetRoots.filter((item) => item.type === 'dir');
  let sheetPreview: string | null = null;
  if (hasCharacterCatalog && sheetDirs.length > 0) {
    const preferred = thumbnailRoots.find((item) => item.type === 'dir' && item.name === 'maki')
      || thumbnailRoots.find((item) => item.type === 'dir');
    if (preferred) {
      sheetPreview = firstImage(await directory(owner, repo.name, preferred.path, ref));
    }
  }
  const characterSheets = hasCharacterCatalog && sheetDirs.length > 0
    ? { count: sheetDirs.length, catalogPath: 'metadata/characters.csv', previewPath: sheetPreview }
    : null;

  let purupuruPreview: string | null = null;
  if (purupuru) {
    const preferred = purupuru.totalStates >= 30
      ? 'docs/screenshots/all-30-runtime-states.png'
      : 'avatar/expression-preview.png';
    purupuruPreview = await exists(owner, repo.name, preferred, ref) ? preferred : firstImage(avatar);
  }

  const evidencePaths = [
    purupuru?.settingsPath,
    purupuru?.motionPatchPath,
    codexPet?.petJsonPath,
    codexPet?.spritesheetPath,
    codexPet?.qaPath,
    characterSheets?.catalogPath,
  ].filter((path): path is string => Boolean(path));

  return {
    purupuru,
    codexPet,
    characterSheets,
    previewPath: purupuruPreview || petPreview || sheetPreview,
    secondaryPreviewPath: sheetPreview && sheetPreview !== petPreview ? sheetPreview : codexPet?.qaPath || null,
    evidencePaths,
  };
}
