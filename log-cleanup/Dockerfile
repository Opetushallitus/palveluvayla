FROM public.ecr.aws/amazonlinux/amazonlinux:2027@sha256:ac917e550bc47ceaf411dde54983a2f366e8c9e357e2c82ae93a6c11f8e2f915

RUN dnf install -y findutils \
    && dnf clean all

COPY scripts/log-cleanup.sh /usr/local/bin/log-cleanup
RUN chmod 755 /usr/local/bin/log-cleanup

ENTRYPOINT ["/usr/local/bin/log-cleanup"]
