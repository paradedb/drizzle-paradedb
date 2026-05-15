# **Contributing to drizzle-paradedb**

Welcome! We're excited that you're interested in contributing to drizzle-paradedb and want to make the process as smooth as possible.

## Technical Info

Before submitting a pull request, please review this document, which outlines what conventions to follow when submitting changes. If you have any questions not covered in this document, please reach out to us in the [ParadeDB Community Slack](https://paradedb.com/slack) or via [email](mailto:support@paradedb.com).

### Selecting GitHub Issues

All external contributions should be associated with a GitHub issue. If there is no open issue for the bug or feature that you'd like to work on, please open one first. When selecting an issue to work on, we recommend focusing on issues labeled `good first issue`.

Ideal issues for external contributors include well-scoped, individual features as those are less likely to conflict with our general development process. We welcome documentation contributions that accompany a feature, correct wrong information, improve clarity, or fix typos.

### Claiming GitHub Issues

This repository has a workflow to assign issues to new contributors automatically. This ensures that you don't need approval from a maintainer to pick an issue.

1. Before claiming an issue, ensure that:
   - It's not already assigned to someone else.
   - There are no comments indicating ongoing work.

2. To claim an unassigned issue, comment `/take` on the issue. This will automatically assign the issue to you.

If you find yourself unable to make progress, don't hesitate to seek help in the issue comments or the [ParadeDB Community Slack](https://paradedb.com/slack). If you no longer wish to work on the issue(s) you self-assigned, please remove yourself from the Assignees list in the sidebar to release it.

### Development Workflow

drizzle-paradedb is an npm package that provides Drizzle ORM integration for ParadeDB. Development is done with `pnpm`, which keeps the Node toolchain and dependencies aligned between local work and CI.

```bash
# Clone the repository
git clone https://github.com/paradedb/drizzle-paradedb.git
cd drizzle-paradedb

# Install pnpm: https://pnpm.io/installation

# Install dependencies
pnpm install

# Start the ParadeDB container and export DATABASE_URL
pnpm db:setup

# Run tests
pnpm test

# Run formatting
pnpm format
pnpm format:check

# Run type checking
pnpm typecheck

# Build the package
pnpm build
```

### Pull Request Workflow

All changes to drizzle-paradedb happen through GitHub Pull Requests. Here is the recommended flow for making a change:

1. Before working on a change, please check if there is already a GitHub issue open for it.
2. If there is not, please open an issue first. This gives the community visibility into your work and allows others to make suggestions and leave comments.
3. Fork the drizzle-paradedb repo and branch out from the `main` branch.
4. Make your changes. If you've added new functionality, please add tests. We will not merge a feature without appropriate tests.
5. Open a pull request towards the `main` branch. Ensure that all tests and checks pass. Note that the drizzle-paradedb repository has pull request title linting in place and follows the [Conventional Commits spec](https://www.conventionalcommits.org/).
6. Congratulations! Our team will review your pull request.

If your change touches SQL wrappers, API constants, packaging, or release metadata, run the API/package checks under `scripts/` before opening the PR.

### Documentation

If you are adding a new feature that requires new documentation, please add the documentation as part of your pull request. Documentation can be added to:

- The main README.md for user-facing features
- TSDoc comments for API documentation
- The `examples/` directory for usage examples

We will not merge a feature without appropriate documentation.

## Legal Info

### Contributor License Agreement

In order for us, ParadeDB, Inc., to accept patches and other contributions from you, you need to adopt our ParadeDB Contributor License Agreement (the "**CLA**"). The current version of the CLA can be found on the [CLA Assistant website](https://cla-assistant.io/paradedb/drizzle-paradedb).

ParadeDB uses a tool called CLA Assistant to help us track contributors' CLA status. CLA Assistant will automatically post a comment to your pull request indicating whether you have signed the CLA. If you have not signed the CLA, you must do so before we can accept your contribution. Signing the CLA is a one-time process for this repository, is valid for all future contributions to drizzle-paradedb, and can be done in under a minute by signing in with your GitHub account.

If you have any questions about the CLA, please reach out to us in the [ParadeDB Community Slack](https://paradedb.com/slack) or via email at [legal@paradedb.com](mailto:legal@paradedb.com).

### License

By contributing to drizzle-paradedb, you agree that your contributions will be licensed under the [MIT License](LICENSE).
