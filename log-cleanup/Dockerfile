FROM public.ecr.aws/amazonlinux/amazonlinux:2023@sha256:d9b4c61f49de68d41e43af1c0ef89c5600b0ad51da024406a15f5d014720c998

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
