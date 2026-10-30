import { describe, expect, it } from 'vitest';
import { addToStarshipConfig, STARSHIP_SEGMENTS } from './starship';

describe('addToStarshipConfig', () => {
  it('adds only the modules when there is no format (the default shows them)', () => {
    const result = addToStarshipConfig('add_newline = false\n');
    expect(result).toContain('add_newline = false\n');
    expect(result).toContain('[env_var.cloudhop_aws]');
    expect(result).not.toContain(STARSHIP_SEGMENTS);
  });

  it('joins a powerline chain before its closing arrow, with its glyph and colors', () => {
    const config = `format = """
[](#9A348E)\\
$directory\\
[](fg:#DA627D bg:#33658A)\\
$time\\
[ ](fg:#33658A)\\
"""

[time]
disabled = false
`;
    const result = addToStarshipConfig(config);
    expect(result).toContain(`$time\\\n${STARSHIP_SEGMENTS}\\\n[ ](fg:#33658A)`);
    expect(result).toContain(
      "format = '[](fg:#33658A bg:#3bb8f5)[ aws $env_value ](bold fg:#0b1124 bg:#3bb8f5)[](fg:#3bb8f5 bg:#33658A)'",
    );
    expect(result).toContain("variable = 'CLOUDHOP_AWS_PROD_SEGMENT'");
    expect(result).toContain('[time]\ndisabled = false');
  });

  it('adds plain colored text at the end of a format without arrows', () => {
    const result = addToStarshipConfig('format = """\n$directory\\\n$time\\\n"""\n');
    expect(result).toContain(`$time\\\n${STARSHIP_SEGMENTS}\\\n"""`);
    expect(result).toContain("format = '[aws $env_value ](bold #3bb8f5)'");
  });

  it('puts them before the line break, so they stay on the first line', () => {
    const result = addToStarshipConfig("format = '$directory$git_branch$line_break$character'\n");
    expect(result).toContain(
      `format = '$directory$git_branch${STARSHIP_SEGMENTS}$line_break$character'`,
    );
  });

  it('leaves $all formats and already configured files alone', () => {
    const all = addToStarshipConfig('format = "$all"\n');
    expect(all).toContain('format = "$all"\n');
    expect(all).not.toContain(`$all${STARSHIP_SEGMENTS}`);
    expect(addToStarshipConfig(all)).toBe(all);
  });

  it('ignores a format inside a table', () => {
    const config = "[time]\nformat = '[ $time ]($style)'\n";
    expect(addToStarshipConfig(config)).toContain("[time]\nformat = '[ $time ]($style)'\n");
  });
});
