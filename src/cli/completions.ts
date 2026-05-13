/**
 * Shell completion generators for `dhara`.
 *
 * Generates shell-specific completion scripts for bash, zsh, and fish.
 * All `$` signs in generated output are escaped with `\\$` to prevent
 * JavaScript template literal interpolation.
 */

function bash(): string {
  const D = "\\$"; // literal $ in generated output
  return `# dhara bash completion
# Source: source <(dhara completion bash)

_dhara() {
    local cur prev words cword
    _init_completion || return

    local opts="${D}--provider ${D}--model ${D}--base-url ${D}--cwd ${D}--resume ${D}--theme ${D}--repl ${D}--no-context-files ${D}--no-project-config ${D}--version ${D}--help"
    local commands="config session doctor completion"
    local config_cmds="list get set delete set-provider switch"
    local session_cmds="list info delete export import search diff stats tag prune"

    if [[ ${D}{cword} -eq 1 ]]; then
        if [[ "${D}{cur}" == -* ]]; then
            COMPREPLY=($(compgen -W "${D}{opts}" -- "${D}{cur}"))
        else
            COMPREPLY=($(compgen -W "${D}{commands}" -- "${D}{cur}"))
        fi
    elif [[ ${D}{cword} -ge 2 ]]; then
        case "${D}{words[1]}" in
            config)
                if [[ ${D}{cword} -eq 2 ]]; then
                    COMPREPLY=($(compgen -W "${D}{config_cmds}" -- "${D}{cur}"))
                fi
                ;;
            session)
                if [[ ${D}{cword} -eq 2 ]]; then
                    COMPREPLY=($(compgen -W "${D}{session_cmds}" -- "${D}{cur}"))
                fi
                ;;
        esac
    fi
    return 0
} &&
complete -F _dhara dhara
`;
}

function zsh(): string {
  return `#compdef dhara
# dhara zsh completion
# Source: compdef _dhara dhara; source <(dhara completion zsh)

_dhara() {
    local context state state_descr line
    typeset -A opt_args

    _arguments -C \\
        '--provider[LLM provider]:provider:(openai anthropic opencode-go google mistral groq deepseek)' \\
        '--model[Model ID]:model:' \\
        '--base-url[Custom API base URL]:url:' \\
        '--cwd[Working directory]:dir:_directories' \\
        '--resume[Resume session]:session:' \\
        '--theme[TUI theme]:theme:(dhara-default dracula nord catppuccin)' \\
        '--repl[Use REPL mode]' \\
        '--no-context-files[Disable context files]' \\
        '--no-project-config[Disable project config]' \\
        '--version[Show version]' \\
        '--help[Show help]' \\
        '1: :->command' \\
        '*:: :->args'

    case $state in
        command)
            local -a commands
            commands=(
                'config:Manage configuration'
                'session:Manage sessions'
                'doctor:Run diagnostics'
                'completion:Generate shell completions'
            )
            _describe 'command' commands
            ;;
        args)
            case $line[1] in
                config)
                    local -a config_cmds
                    config_cmds=(
                        'list:Show configuration'
                        'get:Get a config value'
                        'set:Set a config value'
                        'delete:Delete a config value'
                        'set-provider:Add or update a provider'
                        'switch:Switch active provider'
                    )
                    _describe 'config subcommand' config_cmds
                    ;;
                session)
                    local -a session_cmds
                    session_cmds=(
                        'list:List sessions'
                        'info:Show session details'
                        'delete:Delete a session'
                        'export:Export a session'
                        'import:Import a session'
                        'search:Search sessions'
                        'diff:Compare sessions'
                        'stats:Session statistics'
                        'tag:Tag a session'
                        'prune:Remove old sessions'
                    )
                    _describe 'session subcommand' session_cmds
                    ;;
            esac
            ;;
    esac
}

_dhara
`;
}

function fish(): string {
  return `# dhara fish completion
# Source: source <(dhara completion fish)

function __fish_dhara_no_subcommand -d 'Test if there is no subcommand'
    for i in (commandline -opc)
        if contains -- $i config session doctor completion
            return 1
        end
    end
    return 0
end

# Global options
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l provider -x -a 'openai anthropic opencode-go google mistral groq deepseek' -d 'LLM provider'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l model -x -d 'Model ID'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l base-url -x -d 'Custom API base URL'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l cwd -x -a '(__fish_complete_directories)' -d 'Working directory'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l resume -x -d 'Resume session'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l theme -x -a 'dhara-default dracula nord catppuccin' -d 'TUI theme'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l repl -d 'Use REPL mode'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l no-context-files -d 'Disable context files'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l no-project-config -d 'Disable project config'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l version -d 'Show version'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -l help -d 'Show help'

# Subcommands
complete -c dhara -f -n '__fish_dhara_no_subcommand' -a config -d 'Manage configuration'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -a session -d 'Manage sessions'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -a doctor -d 'Run diagnostics'
complete -c dhara -f -n '__fish_dhara_no_subcommand' -a completion -d 'Generate shell completions'

# Config subcommands
complete -c dhara -f -n '__fish_seen_subcommand_from config' -a list -d 'Show configuration'
complete -c dhara -f -n '__fish_seen_subcommand_from config' -a get -d 'Get a config value'
complete -c dhara -f -n '__fish_seen_subcommand_from config' -a set -d 'Set a config value'
complete -c dhara -f -n '__fish_seen_subcommand_from config' -a delete -d 'Delete a config value'
complete -c dhara -f -n '__fish_seen_subcommand_from config' -a set-provider -d 'Add or update a provider'
complete -c dhara -f -n '__fish_seen_subcommand_from config' -a switch -d 'Switch active provider'

# Session subcommands
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a list -d 'List sessions'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a info -d 'Show session details'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a delete -d 'Delete a session'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a export -d 'Export a session'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a import -d 'Import a session'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a search -d 'Search sessions'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a diff -d 'Compare sessions'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a stats -d 'Session statistics'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a tag -d 'Tag a session'
complete -c dhara -f -n '__fish_seen_subcommand_from session' -a prune -d 'Remove old sessions'
`;
}

export function generateCompletion(shell: string): void {
  switch (shell) {
    case "bash":
      process.stdout.write(bash());
      break;
    case "zsh":
      process.stdout.write(zsh());
      break;
    case "fish":
      process.stdout.write(fish());
      break;
    default:
      process.stderr.write(`Error: Unknown shell "${shell}". Supported: bash, zsh, fish\n`);
      process.exit(1);
  }
}
