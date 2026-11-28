FROM public.ecr.aws/amazonlinux/amazonlinux:2023@sha256:47a249649c57ca32b2d4bd5f46149383d5852610eb2c6230e33ce9c3ab8c8459

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
