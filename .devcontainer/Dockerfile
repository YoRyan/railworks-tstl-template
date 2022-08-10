FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:18-bullseye

RUN (curl https://www.lua.org/ftp/lua-5.0.3.tar.gz | tar xz -C /tmp) \
    && cd /tmp/lua* && ./configure && make all install \
    && cd /tmp && rm -rf lua*