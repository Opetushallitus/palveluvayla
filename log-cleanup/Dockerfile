FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:6d03bdaa33b5a63dec22449ec78c2b7051b3d572dc44f1a155244abef6f63554

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
