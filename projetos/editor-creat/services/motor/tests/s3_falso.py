"""S3 falso em dicionário (para os testes do R2 sem rede): o mínimo do boto3 que o motor usa."""
import hashlib
import io
import os


class ErroS3(Exception):
    def __init__(self, codigo, msg=""):
        super().__init__(msg or codigo)
        self.response = {"Error": {"Code": codigo, "Message": msg}}


class S3Falso:
    def __init__(self, pagina=1000):
        self.obj: dict[tuple[str, str], dict] = {}
        self.subidas: list[str] = []
        self.pagina = pagina
        self.cair = False                       # True: toda chamada levanta erro de rede

    def _rede(self):
        if self.cair:
            raise ConnectionError("Could not connect to the endpoint URL")

    @staticmethod
    def _etag(corpo):
        return '"' + hashlib.md5(corpo).hexdigest() + '"'

    def put_object(self, Bucket, Key, Body, ContentType=None, CacheControl=None, Metadata=None, IfMatch=None, IfNoneMatch=None, **k):
        self._rede()
        corpo = Body if isinstance(Body, bytes) else Body.read()
        atual = self.obj.get((Bucket, Key))
        if IfNoneMatch == "*" and atual is not None:            # escrita condicional, como o R2 (412 PreconditionFailed)
            raise ErroS3("PreconditionFailed", "At least one of the pre-conditions you specified did not hold")
        if IfMatch is not None and (atual is None or self._etag(atual["corpo"]) != IfMatch):
            raise ErroS3("PreconditionFailed", "At least one of the pre-conditions you specified did not hold")
        self.condicionais = getattr(self, "condicionais", []) + ([Key] if (IfMatch or IfNoneMatch) else [])
        self.obj[(Bucket, Key)] = {"corpo": corpo, "ContentType": ContentType, "CacheControl": CacheControl, "Metadata": Metadata or {}}

    def upload_file(self, origem, Bucket, Key, Config=None, ExtraArgs=None):
        self._rede()
        with open(origem, "rb") as f:
            corpo = f.read()
        ea = ExtraArgs or {}
        self.obj[(Bucket, Key)] = {"corpo": corpo, "ContentType": ea.get("ContentType"), "ContentDisposition": ea.get("ContentDisposition"),
                                   "Metadata": ea.get("Metadata") or {}, "Config": Config}
        self.subidas.append(Key)

    def head_object(self, Bucket, Key):
        self._rede()
        o = self.obj.get((Bucket, Key))
        if o is None:
            raise ErroS3("404", "Not Found")
        return {"ContentLength": len(o["corpo"]), "Metadata": dict(o.get("Metadata") or {}), "ContentType": o.get("ContentType")}

    def get_object(self, Bucket, Key):
        self._rede()
        o = self.obj.get((Bucket, Key))
        if o is None:
            raise ErroS3("NoSuchKey", "The specified key does not exist.")
        if getattr(self, "antes_de_ler", None):
            self.antes_de_ler(Key)
        return {"Body": io.BytesIO(o["corpo"]), "ETag": self._etag(o["corpo"])}

    def delete_object(self, Bucket, Key):
        self._rede()
        self.obj.pop((Bucket, Key), None)

    def list_objects_v2(self, Bucket, Prefix="", ContinuationToken=None, MaxKeys=None):
        self._rede()
        ks = sorted(k for (b, k) in self.obj if b == Bucket and k.startswith(Prefix))
        ini = int(ContinuationToken or 0)
        n = MaxKeys or self.pagina
        pg = ks[ini:ini + n]
        r = {"Contents": [{"Key": k, "Size": len(self.obj[(Bucket, k)]["corpo"])} for k in pg]} if pg else {}
        if ini + n < len(ks):
            r["NextContinuationToken"] = str(ini + n)
        return r

    def chaves(self, bucket):
        return sorted(k for (b, k) in self.obj if b == bucket)
