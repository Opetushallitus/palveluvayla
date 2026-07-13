FROM amazon/aws-cli:2.35.22@sha256:c9e67d4b797d5cb38d38cd583b30621737e0230b99d11ea3465fa62fe55add17

ARG system_arch
RUN curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_${system_arch}/session-manager-plugin.rpm" -o "session-manager-plugin.rpm"
RUN yum install -y session-manager-plugin.rpm
RUN yum install -y openssh-clients
RUN yum install -y nc

COPY session-manager-forward-psql.sh .

EXPOSE 2222
HEALTHCHECK --interval=1s --start-period=30s \
  CMD ["nc", "-z", "localhost", "2222"]
ENTRYPOINT ["./session-manager-forward-psql.sh"]
