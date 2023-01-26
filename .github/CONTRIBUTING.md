# Qlik Platform Examples contributing guide

New platform examples or improvements to existing examples are always welcome. 

- [Code of conduct](#code-of-conduct)
- [Bugs](#bugs)
- [Proposing a change](#features)
- [Git guidelines](#git)
- [Signing the CLA](#cla)

## <a name="code-of-conduct"></a> Code of conduct

Please read and follow our [Code of conduct](https://github.com/qlik-oss/open-source/blob/master/CODE_OF_CONDUCT.md)

## <a name="bugs"></a> Bugs

Bugs can be reported by filing a [new bug issue](https://github.com/qlik-oss/qlik-cloud-examples/issues/new?template=bug.md) in the repository. Please make sure to browse through existing [issues](https://github.com/qlik-oss/qlik-cloud-examples/labels/bug) before creating a new one.

## <a name="features"></a> Proposing a change

If you want to propose changes to this project, let us know by [filing a issue](https://github.com/qlik-oss/qlik-cloud-examples/issues/new/choose).

## <a name="git"></a> Git Guidelines

Generally, development should be done directly towards the `main` branch.

### Branching

1. Create a branch

   The branch should be based on the `main` branch in the master repository.

   ```sh
   git checkout -b my-feature-or-bugfix main

### <a name="commit"></a> Commit message guidelines

Commit messages should follow the [commit message convention](https://conventionalcommits.org/).

#### Type

Should be one of the following:

- **build:** Changes that affect the build system or external dependencies
- **chore:** Changes to build and dev processes/tools
- **ci:** Changes to the CI configuration files and scripts
- **docs:** Changes to documentation
- **feat:** A new feature
- **fix:** A bug fix
- **perf:** A code change that improves performance
- **refactor:** Changes to production code that is neither a new feature nor a bug fix
- **revert:** Reverts a previous commit
- **style:** Changes to code style formatting (white space, commas etc)
- **test:** Changes in test cases of production code

#### Scope

The `<scope>` of the commit is optional and can be omitted. When used though, it should describe the place or part of the project, e.g. `docs(examples)`, `feat(data)` etc.

## <a name="cla"></a> Signing the CLA

We need you to sign our Contributor License Agreement (CLA) before we can accept your Pull Request. Visit this link for more information: <https://github.com/qlik-oss/open-source/blob/master/sign-cla.md>.
