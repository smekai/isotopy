const CLAUDE_PERMISSION_MODE_FLAG = "--permission-mode";

const NEXT_OPTION = /\r?\n {1,4}-{1,2}[A-Za-z]/;

const CHOICES = /\(choices:([^)]*)\)/;

const QUOTED = /"([^"]+)"/g;

function optionBlock(help: string, flag: string): string | undefined {
  const start = help.indexOf(flag);
  if (start < 0) {
    return undefined;
  }
  const rest = help.slice(start + flag.length);
  const next = rest.search(NEXT_OPTION);
  return next < 0 ? rest : rest.slice(0, next);
}

export function claudePermissionModeChoices(help: string): string[] {
  const block = optionBlock(help, CLAUDE_PERMISSION_MODE_FLAG);
  if (block === undefined) {
    return [];
  }
  const choices = CHOICES.exec(block);
  if (choices === null) {
    return [];
  }
  return [...choices[1]!.matchAll(QUOTED)].map((match) => match[1]!);
}
