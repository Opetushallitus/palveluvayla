FROM public.ecr.aws/amazonlinux/amazonlinux:2023@sha256:5c6ed3b38335b2aa424a045f1e564c8c508409ead0ff3f8bf5e62c31b94082cb

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
