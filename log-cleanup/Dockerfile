FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:bd4d8e966a81ff14270ac22529aae73dc68e7c12e6aa05d9020f3e5a56ab602d

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
