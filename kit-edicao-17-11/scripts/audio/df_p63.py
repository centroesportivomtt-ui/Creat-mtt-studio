# P63: na 2a metade o homem vira o rosto e a voz cai ~20 dB; o DeepFilterNet com atenuacao total apaga a voz junto com o salao.
# Aqui: DeepFilterNet com limite de atenuacao (14 dB) so para essa janela -> df/v_210219_835.56_855.00_d14.wav
import sys, os
S='/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad'; O=S+'/maxima/build/audio2/df/v_210219_835.56_855.00'
sys.path.insert(0,S+'/drako/V2/lib'); sys.path.insert(0,S+'/mesa/E1/py')
if not os.path.exists(O+'_d14.wav'):
    import dfshim, torch, soundfile as sf
    from df.enhance import init_df, enhance
    torch.set_num_threads(4); model, st, _ = init_df(S+'/mesa/E1/dfn3', log_level='ERROR')
    x,sr=sf.read(O+'_o.wav',dtype='float32',always_2d=True)
    y=enhance(model, st, torch.from_numpy(x.T.copy()), atten_lim_db=14)
    sf.write(O+'_d14.tmp.wav',y.numpy().T,sr,subtype='FLOAT'); os.replace(O+'_d14.tmp.wav',O+'_d14.wav')
print('ok d14')
