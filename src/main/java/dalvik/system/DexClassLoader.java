package dalvik.system;

import java.net.URLClassLoader;
import java.net.URL;

public class DexClassLoader extends URLClassLoader {
    public DexClassLoader(String dexPath, String optimizedDirectory, String librarySearchPath, ClassLoader parent) {
        super(new URL[0], parent);
    }
}
