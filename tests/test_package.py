import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('packager',ROOT/'scripts/prepare-repo.py')
packager=importlib.util.module_from_spec(spec);spec.loader.exec_module(packager)

class PackageTests(unittest.TestCase):
    def test_private_deployment_files_and_dependencies_never_ship(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name in ['README.md','relay','site/index.html','client/.env','client/.impeccable/config.json','client/.npmrc','client/node_modules/hidden.js','.relay-state/state.json','.snapchain-aws/test-account.json','SNAPCHAIN-OPERATIONS.md']:
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('fixture')
            with patch.object(packager,'ROOT',root):
                manifest=packager.build(root/'public.zip')
            names={x['path'] for x in manifest}
            self.assertEqual(names,{'README.md','relay','site/index.html'})
            with zipfile.ZipFile(root/'public.zip') as archive:
                self.assertIn('relay/SOURCE-MANIFEST.json',archive.namelist())
                self.assertEqual((archive.getinfo('relay/relay').external_attr>>16)&0o777,0o755)
    def test_secret_scan_refuses_key_content_without_printing_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'README.md').write_text('-----BEGIN '+'OPENSSH PRIVATE KEY-----')
            with patch.object(packager,'ROOT',root),self.assertRaisesRegex(RuntimeError,'private-key in README'):
                packager.build(root/'public.zip')
    def test_public_symlinks_cannot_escape_allowlist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'outside').write_text('private fixture');(root/'README.md').symlink_to(root/'outside')
            with patch.object(packager,'ROOT',root),self.assertRaisesRegex(RuntimeError,'symlink'):
                packager.build(root/'public.zip')

if __name__=='__main__':unittest.main()
